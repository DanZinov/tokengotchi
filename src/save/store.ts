import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ClassId, GameState } from "../engine/types.js";

const DIR = join(homedir(), ".tokengotchi");
const FILE = join(DIR, "save.json");

export const SAVE_VERSION = 2;

export function newGame(cls: ClassId = "architect"): GameState {
  const now = new Date().toISOString();
  return {
    version: SAVE_VERSION,
    hero: { class: cls, level: 1, xp: 0, energy: 0 },
    gear: { weapon: null, armor: null, trinket: null },
    inventory: [],
    gold: 0,
    progress: { zone: 1, floor: 1, bossesCleared: 0 },
    daily: { lastActiveDate: null, streakDays: 0, energyToday: 0 },
    usage: { cursors: {}, lifetimeTokens: 0 },
    prestige: { count: 0, multiplier: 1 },
    createdAt: now,
    lastSyncAt: null,
  };
}

/** Backfill fields added in newer schema versions so old saves keep their progress. */
export function migrate(raw: any): GameState {
  const base = newGame(raw?.hero?.class ?? "architect");
  const s: GameState = {
    ...base,
    ...raw,
    hero: { ...base.hero, ...raw?.hero },
    gear: { ...base.gear, ...raw?.gear },
    progress: { ...base.progress, ...raw?.progress },
    daily: { ...base.daily, ...raw?.daily },
    usage: { ...base.usage, ...raw?.usage },
    prestige: { ...base.prestige, ...raw?.prestige },
  };
  s.version = SAVE_VERSION;
  return s;
}

export function load(): GameState {
  if (!existsSync(FILE)) return newGame();
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8"));
    // Forward-migrate (preserves progress) rather than wiping on schema change.
    return migrate(raw);
  } catch {
    return newGame();
  }
}

export function save(state: GameState): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(state, null, 2), "utf8");
}

export const savePath = FILE;
