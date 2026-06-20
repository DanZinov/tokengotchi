import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import type { UsageDelta, UsageReader } from "./types.js";
import { diffByFileTotals, listFilesRecursive } from "./fsutil.js";

// Codex writes rollout-*.jsonl under $CODEX_HOME/sessions (default ~/.codex), nested
// by date. Token usage arrives as `token_count` events that report CUMULATIVE session
// totals (per ccusage + openai/codex issues), so we track each file's latest cumulative
// and diff it — never sum the events directly or you'll massively overcount.

function codexHome(): string {
  return process.env.CODEX_HOME || join(homedir(), ".codex");
}

function sessionDirs(): string[] {
  const home = codexHome();
  return [join(home, "sessions"), join(home, "archived_sessions")];
}

/** Pull a cumulative total-token figure out of one parsed line, or null if it isn't a token_count. */
export function codexCumulativeFromLine(obj: unknown): number | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, any>;
  const payload = o.payload ?? o;
  const isTokenCount = payload?.type === "token_count" || o.type === "token_count";
  if (!isTokenCount) return null;

  // Newer (>=0.44): payload.info.total_token_usage.{...}; older: flat fields.
  const totalObj =
    payload?.info?.total_token_usage ?? payload?.total_token_usage ?? payload?.info ?? payload ?? o;

  const direct = num(totalObj.total_tokens) ?? num(totalObj.total);
  if (direct !== null) return direct;

  // Fall back to summing components.
  const parts = [
    totalObj.input_tokens,
    totalObj.output_tokens,
    totalObj.cached_input_tokens,
    totalObj.reasoning_output_tokens,
  ]
    .map(num)
    .filter((v): v is number => v !== null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

function fileCumulativeTotal(path: string): number {
  const text = readFileSync(path, "utf8");
  let last = 0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.indexOf("token_count") === -1) continue; // cheap pre-filter
    try {
      const cum = codexCumulativeFromLine(JSON.parse(t));
      if (cum !== null) last = cum; // cumulative is monotonic; last wins
    } catch {
      /* skip */
    }
  }
  return last;
}

export const codexReader: UsageReader = {
  id: "codex",
  detect() {
    return sessionDirs().some((d) => existsSync(d));
  },
  async readSince(cursor?: string): Promise<UsageDelta> {
    const files = sessionDirs().flatMap((d) => listFilesRecursive(d, (n) => n.startsWith("rollout-") && n.endsWith(".jsonl")));
    return diffByFileTotals(files, cursor, fileCumulativeTotal);
  },
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
