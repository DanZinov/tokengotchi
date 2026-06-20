export interface UsageDelta {
  tokens: number;
  nextCursor: string; // opaque; pass back next time
}

/**
 * Reads how many tokens have been consumed since `cursor`. Each tool (Claude Code,
 * Cursor, Codex, ...) gets its own adapter. The cursor is an opaque watermark so
 * re-running never double-counts.
 */
export interface UsageReader {
  id: string;
  detect(): boolean | Promise<boolean>;
  readSince(cursor?: string): UsageDelta | Promise<UsageDelta>;
}

/**
 * Defensive token extraction. Agent logs nest usage differently and the schema
 * drifts, so we look in the known places and sum whatever's present rather than
 * assuming one exact shape.
 */
export function extractTokens(obj: unknown): number {
  if (!obj || typeof obj !== "object") return 0;
  const o = obj as Record<string, any>;
  const usage = o.usage ?? o.message?.usage ?? o.response?.usage;
  if (!usage || typeof usage !== "object") return 0;
  const fields = [
    "input_tokens",
    "output_tokens",
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
    "total_tokens",
    "prompt_tokens",
    "completion_tokens",
  ];
  let sum = 0;
  for (const f of fields) {
    const v = usage[f];
    if (typeof v === "number" && Number.isFinite(v)) sum += v;
  }
  // Avoid double-counting when both total_* and component fields exist.
  if (typeof usage.total_tokens === "number" && (usage.input_tokens || usage.output_tokens)) {
    sum -= usage.total_tokens;
  }
  return Math.max(0, Math.round(sum));
}
