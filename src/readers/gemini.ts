import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { UsageDelta, UsageReader } from "./types.js";
import { diffByFileTotals, listFilesRecursive } from "./fsutil.js";

// Gemini CLI records sessions under GEMINI_DATA_DIR (default ~/.gemini/tmp), as
// */chats/*.{json,jsonl}. Each message carries its own token stats (input, output,
// cached, thought, tool, total) — per-message, NOT cumulative — so a file's total is
// the sum across its messages. .json files get rewritten, so we diff per-file totals.

function dataDirs(): string[] {
  const env = process.env.GEMINI_DATA_DIR;
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return [join(homedir(), ".gemini", "tmp")];
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Tokens for a single Gemini message/record. Handles both the normalized `tokens`
 *  object and raw Gemini API `usageMetadata`. Prefers a total to avoid double-counting. */
export function extractGeminiTokens(obj: unknown): number {
  if (!obj || typeof obj !== "object") return 0;
  const o = obj as Record<string, any>;

  const tokens = o.tokens ?? o.message?.tokens;
  if (tokens && typeof tokens === "object") {
    const total = num(tokens.total);
    if (total !== null) return total;
    const sum = ["input", "output", "cached", "thought", "thoughts", "tool"]
      .map((k) => num(tokens[k]))
      .filter((v): v is number => v !== null)
      .reduce((a, b) => a + b, 0);
    if (sum > 0) return sum;
  }

  const um = o.usageMetadata ?? o.message?.usageMetadata ?? o.response?.usageMetadata;
  if (um && typeof um === "object") {
    const total = num(um.totalTokenCount);
    if (total !== null) return total;
    const sum = ["promptTokenCount", "candidatesTokenCount", "cachedContentTokenCount", "thoughtsTokenCount", "toolUsePromptTokenCount"]
      .map((k) => num(um[k]))
      .filter((v): v is number => v !== null)
      .reduce((a, b) => a + b, 0);
    if (sum > 0) return sum;
  }

  return 0;
}

function fileTotal(path: string): number {
  const raw = readFileSync(path, "utf8");
  let total = 0;
  if (path.endsWith(".jsonl")) {
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        total += extractGeminiTokens(JSON.parse(t));
      } catch {
        /* skip */
      }
    }
    return total;
  }
  // .json — a single document; messages may be an array or nested under .messages.
  try {
    const doc = JSON.parse(raw);
    const list: unknown[] = Array.isArray(doc) ? doc : Array.isArray(doc?.messages) ? doc.messages : [doc];
    for (const m of list) total += extractGeminiTokens(m);
  } catch {
    /* skip */
  }
  return total;
}

export const geminiReader: UsageReader = {
  id: "gemini",
  detect() {
    return dataDirs().some((d) => existsSync(d));
  },
  async readSince(cursor?: string): Promise<UsageDelta> {
    const files = dataDirs().flatMap((root) =>
      listFilesRecursive(root, (n) => n.endsWith(".jsonl") || n.endsWith(".json")).filter((p) => p.includes("chats")),
    );
    return diffByFileTotals(files, cursor, fileTotal);
  },
};
