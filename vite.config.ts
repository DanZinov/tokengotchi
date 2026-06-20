import { defineConfig } from "vite";

// The client is a single-page Pixi app. In dev, run `npm run dev:client` (Vite, :5173)
// alongside `npm run dev:engine` (the CLI engine + WebSocket, :7070).
// In production, `npm run build` outputs to dist/, which the CLI serves directly.
export default defineConfig({
  root: ".",
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
