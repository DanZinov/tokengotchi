import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { UsageDelta, UsageReader } from "./types.js";
import { diffByFileTotals, listFilesRecursive } from "./fsutil.js";

// ⚠️ EXPERIMENTAL. Unlike the agent CLIs, Cursor is an editor and its usage is mostly
// server-side. It DOES cache token data in a local SQLite db (state.vscdb), but the
// schema is undocumented and shifts between versions, and "Auto" mode hides the model.
// This reader makes a best-effort scan of the chat/composer rows. The reliable path for
// teams is Cursor's Admin API (https://cursor.com/docs/account/teams/admin-api).
// We only activate the reader if a SQLite driver is actually loadable.

function configDir(): string {
  if (process.env.CURSOR_CONFIG_DIR) return process.env.CURSOR_CONFIG_DIR;
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Cursor");
  if (process.platform === "win32") return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Cursor");
  return join(homedir(), ".config", "Cursor");
}

function dbFiles(): string[] {
  const base = configDir();
  const files: string[] = [];
  const global = join(base, "User", "globalStorage", "state.vscdb");
  if (existsSync(global)) files.push(global);
  files.push(...listFilesRecursive(join(base, "User", "workspaceStorage"), (n) => n === "state.vscdb"));
  return files;
}

const TOKEN_TOTAL_KEYS = ["totalTokens", "total_tokens"];
const TOKEN_PART_KEYS = [
  "inputTokens", "outputTokens", "input_tokens", "output_tokens",
  "cacheReadTokens", "cacheWriteTokens", "cacheReadInputTokens", "cacheCreationInputTokens",
  "cached_tokens", "promptTokens", "completionTokens",
];

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function ownTotal(o: Record<string, any>): number {
  for (const k of TOKEN_TOTAL_KEYS) {
    const v = num(o[k]);
    if (v !== null) return v;
  }
  if (num(o.tokenCount) !== null) return num(o.tokenCount)!;
  let sum = 0;
  for (const k of TOKEN_PART_KEYS) {
    const v = num(o[k]);
    if (v !== null) sum += v;
  }
  return sum;
}

/** Recursively total token usage in a parsed blob. A node that reports its own token
 *  total is treated as a usage leaf (not recursed into) to avoid double-counting. */
export function scanCursorTokens(v: unknown): number {
  if (Array.isArray(v)) return v.reduce<number>((a, x) => a + scanCursorTokens(x), 0);
  if (v && typeof v === "object") {
    const own = ownTotal(v as Record<string, any>);
    if (own > 0) return own;
    let s = 0;
    for (const val of Object.values(v as Record<string, any>)) s += scanCursorTokens(val);
    return s;
  }
  return 0;
}

const KEY_FILTER = /composer|bubble|aiservice|chat|usage/i;

// ── SQLite loading (no hard dependency) ──────────────────────────────────────
type Row = { value: unknown };
type Db = { rows: () => Row[]; close: () => void };

async function openDb(path: string): Promise<Db | null> {
  // Prefer Node's built-in (Node >=22.5 / unflagged in 24+); fall back to better-sqlite3.
  const nodeSpec = "node:sqlite";
  try {
    const m: any = await import(nodeSpec);
    const db = new m.DatabaseSync(path, { readOnly: true });
    return {
      rows: () => collect((sql) => db.prepare(sql).all()),
      close: () => db.close(),
    };
  } catch {
    /* fall through */
  }
  const bsSpec = "better-sqlite3";
  try {
    const m: any = await import(bsSpec);
    const Database = m.default ?? m;
    const db = new Database(path, { readonly: true, fileMustExist: true });
    return {
      rows: () => collect((sql) => db.prepare(sql).all()),
      close: () => db.close(),
    };
  } catch {
    return null;
  }
}

function collect(all: (sql: string) => any[]): Row[] {
  const out: Row[] = [];
  for (const table of ["ItemTable", "cursorDiskKV"]) {
    try {
      for (const r of all(`SELECT key, value FROM ${table}`)) {
        if (typeof r.key === "string" && !KEY_FILTER.test(r.key)) continue;
        out.push({ value: r.value });
      }
    } catch {
      /* table may not exist */
    }
  }
  return out;
}

async function dbTotal(path: string): Promise<number> {
  const db = await openDb(path);
  if (!db) throw new Error("no sqlite driver");
  try {
    let total = 0;
    for (const r of db.rows()) {
      const text = typeof r.value === "string" ? r.value : Buffer.isBuffer(r.value) ? r.value.toString("utf8") : null;
      if (!text) continue;
      try {
        total += scanCursorTokens(JSON.parse(text));
      } catch {
        /* not json */
      }
    }
    return total;
  } finally {
    db.close();
  }
}

let warned = false;

export const cursorReader: UsageReader = {
  id: "cursor",
  async detect() {
    if (!existsSync(configDir())) return false;
    const files = dbFiles();
    if (files.length === 0) return false;
    const db = await openDb(files[0]).catch(() => null);
    if (!db) {
      if (!warned) {
        console.warn("[cursor] detected, but no SQLite driver available — `npm i better-sqlite3` or use Node >=22.5 to enable it.");
        warned = true;
      }
      return false;
    }
    db.close();
    return true;
  },
  async readSince(cursor?: string): Promise<UsageDelta> {
    return diffByFileTotals(dbFiles(), cursor, dbTotal);
  },
};
