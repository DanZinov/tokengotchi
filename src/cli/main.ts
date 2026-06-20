import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { tick } from "../engine/index.js";
import { canPrestige, prestige } from "../engine/prestige.js";
import { CLASSES } from "../engine/constants.js";
import type { ClassId } from "../engine/types.js";
import { systemRng } from "../util/rng.js";
import { load, save, savePath } from "../save/store.js";
import { detectReaders, mockReader, type UsageReader } from "../readers/index.js";
import { startServer } from "./server.js";

interface Args {
  mock: boolean;
  once: boolean;
  port: number;
  intervalMs: number;
  open: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { mock: false, once: false, port: 7070, intervalMs: 60_000, open: true };
  for (const arg of argv) {
    if (arg === "--mock") a.mock = true;
    else if (arg === "--once") a.once = true;
    else if (arg === "--no-open") a.open = false;
    else if (arg.startsWith("--port=")) a.port = Number(arg.split("=")[1]) || a.port;
    else if (arg.startsWith("--interval=")) a.intervalMs = Number(arg.split("=")[1]) || a.intervalMs;
  }
  return a;
}

/** Locate the built client. Works whether we run from src (dev) or bin/ (packaged). */
function resolveDistDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "dist"), // packaged: <pkg>/bin/../dist
    join(here, "..", "..", "dist"), // dev (tsx): src/cli/../../dist
  ];
  return candidates.find((d) => existsSync(d)) ?? candidates[0];
}

/** Best-effort: open the game in the default browser (skipped with --no-open). */
function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start \"\"" : "xdg-open";
  exec(`${cmd} ${url}`, () => {});
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let state = load();

  const readers: UsageReader[] = args.mock ? [mockReader] : await detectReaders();
  if (readers.length === 0) {
    console.error("No usage sources detected. Try --mock, or use Claude Code so ~/.claude/projects exists.");
    process.exit(1);
  }
  console.log(`Tokengotchi v0 — readers: ${readers.map((r) => r.id).join(", ")}`);
  console.log(`Save: ${savePath}`);

  type TickPayload = { events: unknown[]; summary: unknown; tokens: number; energyGained: number };

  async function syncOnce(): Promise<TickPayload | null> {
    let totalTokens = 0;
    for (const r of readers) {
      const delta = await r.readSince(state.usage.cursors[r.id]);
      state.usage.cursors[r.id] = delta.nextCursor;
      totalTokens += delta.tokens;
    }
    if (totalTokens <= 0) return null;
    const res = tick(state, totalTokens, new Date(), systemRng);
    state = res.state;
    save(state);
    const s = res.summary;
    console.log(
      `+${totalTokens} tok → floors ${s.floorsCleared}, +${s.gold}g, +${s.xpGained}xp, ${s.drops.length} drops` +
        (s.levelsGained ? `, +${s.levelsGained} lvl` : "") +
        (s.defeated ? " (stalled)" : "") +
        ` | floor ${state.progress.floor}, lvl ${state.hero.level}, streak ${state.daily.streakDays}`,
    );
    return { events: res.events, summary: res.summary, tokens: res.tokensApplied, energyGained: res.energyGained };
  }

  if (args.once) {
    await syncOnce();
    return;
  }

  const distDir = resolveDistDir();
  const server = startServer(args.port, distDir);
  server.onConnect((send) => send({ kind: "state", state }));
  const url = `http://localhost:${args.port}`;
  console.log(`Serving on ${url}  (ws on same port)`);
  if (args.open) openBrowser(url);

  // Client → engine commands: pick a class, prestige. Each mutates state, persists,
  // and broadcasts the new state so every connected client stays in sync.
  server.onMessage((msg) => {
    if (!msg || msg.kind !== "command") return;
    if (msg.cmd === "setClass" && (msg.class as string) in CLASSES) {
      state.hero.class = msg.class as ClassId;
      save(state);
      server.broadcast({ kind: "state", state });
      server.broadcast({ kind: "notice", text: `Class → ${CLASSES[state.hero.class].name}`, tone: "good" });
    } else if (msg.cmd === "prestige") {
      if (canPrestige(state)) {
        state = prestige(state);
        save(state);
        server.broadcast({ kind: "state", state });
        server.broadcast({ kind: "notice", text: `Prestige ${state.prestige.count}! Permanent ×${state.prestige.multiplier.toFixed(2)}`, tone: "good" });
      } else {
        server.broadcast({ kind: "notice", text: "Reach the first boss (floor 10) before prestiging.", tone: "bad" });
      }
    }
  });

  const run = async () => {
    const res = await syncOnce();
    server.broadcast({ kind: "state", state });
    if (res) server.broadcast({ kind: "tick", events: res.events, summary: res.summary, tokens: res.tokens, energyGained: res.energyGained });
  };

  await run();
  setInterval(run, args.intervalMs);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
