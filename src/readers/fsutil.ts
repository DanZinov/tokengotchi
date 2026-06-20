import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Recursively collect files under `dir` matching `match(filename)`. Safe if dir is missing. */
export function listFilesRecursive(dir: string, match: (name: string) => boolean): string[] {
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
      else if (e.isFile() && match(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

type Totals = Record<string, number>;

/**
 * Generic incremental counter for sources where each file has a monotonically
 * growing "current total" (Codex cumulative token_count, or a re-summed Gemini
 * chat file). We store each file's last-seen total in the cursor and return the
 * positive delta. Robust to appended *and* rewritten files, and never double-counts.
 */
export async function diffByFileTotals(
  files: string[],
  prevCursor: string | undefined,
  computeTotal: (file: string) => number | Promise<number>,
): Promise<{ tokens: number; nextCursor: string }> {
  const prev: Totals = safeParse(prevCursor);
  const next: Totals = { ...prev };
  let tokens = 0;
  for (const f of files) {
    let total = 0;
    try {
      total = await computeTotal(f);
    } catch {
      total = prev[f] ?? 0; // unreadable this pass — keep prior, contribute nothing
    }
    const before = prev[f] ?? 0;
    if (total > before) tokens += total - before;
    next[f] = Math.max(total, before); // never let a transient dip lose ground
  }
  return { tokens, nextCursor: JSON.stringify(next) };
}

export function safeParse(s: string | undefined): Totals {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Totals) : {};
  } catch {
    return {};
  }
}
