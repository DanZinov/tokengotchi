import { CONFIG } from "./constants.js";
import type { GameState } from "./types.js";

const clone = <T>(x: T): T => structuredClone(x);

/** You can prestige once you've cleared the first boss (PRESTIGE_MIN_FLOOR). */
export function canPrestige(state: GameState): boolean {
  return state.progress.floor >= CONFIG.PRESTIGE_MIN_FLOOR;
}

/** The permanent multiplier you'd *gain* by prestiging right now (deeper run → bigger gain). */
export function prestigeGain(state: GameState): number {
  return +(state.progress.floor * CONFIG.PRESTIGE_MULT_PER_FLOOR).toFixed(2);
}

/**
 * Reset the run for a permanent multiplier (PRD §4.3). Wipes floor/level/gear/gold so
 * you climb again — faster, because the multiplier boosts damage, gold, and xp. Keeps
 * the things that reflect *real-world* activity: usage, streak, and account age.
 */
export function prestige(state: GameState): GameState {
  if (!canPrestige(state)) return state;
  const s = clone(state);
  const gained = prestigeGain(state);

  s.prestige.count += 1;
  s.prestige.multiplier = +(s.prestige.multiplier + gained).toFixed(2);

  // Fresh run.
  s.hero.level = 1;
  s.hero.xp = 0;
  s.hero.energy = 0;
  s.gear = { weapon: null, armor: null, trinket: null };
  s.inventory = [];
  s.gold = 0;
  s.progress = { zone: 1, floor: 1, bossesCleared: 0 };
  // Energy already earned today is spent; reset the bucket so the day's curve restarts.
  s.daily.energyToday = 0;

  return s;
}
