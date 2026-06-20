import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexReader, codexCumulativeFromLine } from "../src/readers/codex.js";
import { geminiReader, extractGeminiTokens } from "../src/readers/gemini.js";
import { scanCursorTokens } from "../src/readers/cursor.js";

const tmps: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tf-"));
  tmps.push(d);
  return d;
}
afterEach(() => {
  delete process.env.CODEX_HOME;
  delete process.env.GEMINI_DATA_DIR;
  while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
});

describe("codex extraction", () => {
  it("reads nested total_token_usage (>=0.44 shape)", () => {
    const line = { payload: { type: "token_count", info: { total_token_usage: { total_tokens: 100 } } } };
    expect(codexCumulativeFromLine(line)).toBe(100);
  });
  it("reads flat token_count and sums components when no total", () => {
    expect(codexCumulativeFromLine({ type: "token_count", total_tokens: 50 })).toBe(50);
    expect(codexCumulativeFromLine({ payload: { type: "token_count", info: { input_tokens: 10, output_tokens: 5 } } })).toBe(15);
  });
  it("ignores non token_count lines", () => {
    expect(codexCumulativeFromLine({ type: "message" })).toBeNull();
  });
});

describe("codex reader (cumulative → delta)", () => {
  it("counts the latest cumulative, then only the growth on the next read", async () => {
    const home = tmp();
    const dir = join(home, "sessions", "2026", "06", "19");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "rollout-abc.jsonl");
    writeFileSync(
      file,
      [
        JSON.stringify({ payload: { type: "token_count", info: { total_token_usage: { total_tokens: 100 } } } }),
        JSON.stringify({ payload: { type: "token_count", info: { total_token_usage: { total_tokens: 250 } } } }),
      ].join("\n") + "\n",
    );
    process.env.CODEX_HOME = home;

    const first = await codexReader.readSince(undefined);
    expect(first.tokens).toBe(250);

    appendFileSync(file, JSON.stringify({ payload: { type: "token_count", info: { total_token_usage: { total_tokens: 400 } } } }) + "\n");
    const second = await codexReader.readSince(first.nextCursor);
    expect(second.tokens).toBe(150);

    const third = await codexReader.readSince(second.nextCursor);
    expect(third.tokens).toBe(0);
  });
});

describe("gemini extraction", () => {
  it("prefers a total, falls back to components, handles usageMetadata", () => {
    expect(extractGeminiTokens({ tokens: { total: 120 } })).toBe(120);
    expect(extractGeminiTokens({ tokens: { input: 10, output: 5, cached: 2 } })).toBe(17);
    expect(extractGeminiTokens({ usageMetadata: { totalTokenCount: 90 } })).toBe(90);
    expect(extractGeminiTokens({})).toBe(0);
  });
});

describe("gemini reader (per-message sum → delta)", () => {
  it("sums message tokens and only counts new ones on the next read", async () => {
    const root = tmp();
    const dir = join(root, "proj_hash", "chats");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "session.jsonl");
    writeFileSync(file, [JSON.stringify({ tokens: { total: 30 } }), JSON.stringify({ tokens: { total: 20 } })].join("\n") + "\n");
    process.env.GEMINI_DATA_DIR = root;

    const first = await geminiReader.readSince(undefined);
    expect(first.tokens).toBe(50);

    appendFileSync(file, JSON.stringify({ tokens: { total: 25 } }) + "\n");
    const second = await geminiReader.readSince(first.nextCursor);
    expect(second.tokens).toBe(25);
  });
});

describe("cursor token scan", () => {
  it("sums leaf usage nodes without double-counting a node's own total", () => {
    const blob = {
      bubbles: [{ usage: { inputTokens: 10, outputTokens: 5 } }, { usage: { totalTokens: 20 } }],
    };
    expect(scanCursorTokens(blob)).toBe(35);
  });
  it("prefers a node's totalTokens and does not also add its components", () => {
    expect(scanCursorTokens({ a: { totalTokens: 20, inputTokens: 999 } })).toBe(20);
  });
});
