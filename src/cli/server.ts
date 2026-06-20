import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { WebSocketServer, WebSocket } from "ws";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export interface Broadcaster {
  port: number;
  broadcast: (msg: unknown) => void;
  /** Called whenever a new client connects, so we can send it the current state. */
  onConnect: (cb: (send: (msg: unknown) => void) => void) => void;
  /** Called for every message a client sends (e.g. pick-class / prestige commands). */
  onMessage: (cb: (msg: any, send: (msg: unknown) => void) => void) => void;
  close: () => void;
}

export function startServer(port: number, distDir: string): Broadcaster {
  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    const hasDist = existsSync(distDir);
    if (!hasDist) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(devHint(port));
      return;
    }
    let urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    const filePath = normalize(join(distDir, urlPath));
    if (!filePath.startsWith(distDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      // SPA fallback
      const index = join(distDir, "index.html");
      if (existsSync(index)) {
        res.writeHead(200, { "content-type": MIME[".html"] });
        res.end(readFileSync(index));
        return;
      }
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(readFileSync(filePath));
  });

  const wss = new WebSocketServer({ server: http });
  let connectCb: ((send: (msg: unknown) => void) => void) | null = null;
  let messageCb: ((msg: any, send: (msg: unknown) => void) => void) | null = null;

  wss.on("connection", (ws: WebSocket) => {
    const send = (msg: unknown) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };
    if (connectCb) connectCb(send);
    ws.on("message", (data) => {
      if (!messageCb) return;
      try {
        messageCb(JSON.parse(data.toString()), send);
      } catch {
        /* ignore malformed client messages */
      }
    });
  });

  http.listen(port);

  return {
    port,
    broadcast(msg: unknown) {
      const data = JSON.stringify(msg);
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) client.send(data);
      }
    },
    onConnect(cb) {
      connectCb = cb;
    },
    onMessage(cb) {
      messageCb = cb;
    },
    close() {
      wss.close();
      http.close();
    },
  };
}

function devHint(port: number): string {
  return `<!doctype html><meta charset=utf-8><title>Tokengotchi</title>
<body style="font:14px ui-monospace,monospace;background:#0b0f0c;color:#7dffa0;padding:2rem">
<h1>Tokengotchi engine is running on :${port}</h1>
<p>No client build found. For development, run the Vite client in another terminal:</p>
<pre>  npm run dev:client</pre>
<p>then open <a style="color:#9ad" href="http://localhost:5173/?ws=ws://localhost:${port}">http://localhost:5173</a>.</p>
<p>For a single-command build: <pre>  npm run build &amp;&amp; npm start</pre></p>
</body>`;
}
