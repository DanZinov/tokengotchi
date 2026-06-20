import type { UsageDelta, UsageReader } from "./types.js";
import { claudeCodeReader } from "./claudeCode.js";
import { codexReader } from "./codex.js";
import { geminiReader } from "./gemini.js";
import { cursorReader } from "./cursor.js";

/** Emits a random token burst each read — for testing the loop with no real data. */
export const mockReader: UsageReader = {
  id: "mock",
  detect: () => true,
  readSince(_cursor?: string): UsageDelta {
    const tokens = 500 + Math.floor(Math.random() * 5000);
    return { tokens, nextCursor: "" };
  },
};

// Order matters only for display; detection decides what's actually used.
export const ALL_READERS: UsageReader[] = [claudeCodeReader, codexReader, geminiReader, cursorReader];

/** Returns the readers whose data is actually present (and readable) on this machine. */
export async function detectReaders(): Promise<UsageReader[]> {
  const out: UsageReader[] = [];
  for (const r of ALL_READERS) {
    try {
      if (await r.detect()) out.push(r);
    } catch {
      /* a flaky detector shouldn't break the others */
    }
  }
  return out;
}

export { claudeCodeReader, codexReader, geminiReader, cursorReader };
export type { UsageReader, UsageDelta } from "./types.js";
