import { readdirSync, statSync, existsSync, createReadStream } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { extractTokens, type UsageDelta, type UsageReader } from "./types.js";

type Offsets = Record<string, number>; // absolute file path -> bytes already read

function baseDir(): string {
  return join(homedir(), ".claude", "projects");
}

function listJsonl(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

async function sumFileFrom(path: string, startByte: number): Promise<{ tokens: number; endByte: number }> {
  const size = statSync(path).size;
  if (startByte >= size) return { tokens: 0, endByte: size };
  let tokens = 0;
  const stream = createReadStream(path, { start: startByte, encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      tokens += extractTokens(JSON.parse(trimmed));
    } catch {
      // partial/garbled line — skip
    }
  }
  return { tokens, endByte: size };
}

/**
 * Reads Claude Code's local session logs. This is the same data source ccusage and
 * tokscale parse; in production you'd likely depend on ccusage instead of re-walking
 * the files, but this keeps v0 dependency-free and shows the shape.
 */
export const claudeCodeReader: UsageReader = {
  id: "claude-code",

  detect() {
    return existsSync(baseDir());
  },

  async readSince(cursor?: string): Promise<UsageDelta> {
    const offsets: Offsets = cursor ? safeParse(cursor) : {};
    const files = listJsonl(baseDir());
    let tokens = 0;
    const nextOffsets: Offsets = { ...offsets };
    for (const f of files) {
      const start = offsets[f] ?? 0;
      const { tokens: t, endByte } = await sumFileFrom(f, start);
      tokens += t;
      nextOffsets[f] = endByte;
    }
    return { tokens, nextCursor: JSON.stringify(nextOffsets) };
  },
};

function safeParse(s: string): Offsets {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Offsets) : {};
  } catch {
    return {};
  }
}
