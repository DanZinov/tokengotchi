import { CONFIG } from "./constants.js";
import type { Hero } from "./types.js";

export function xpToNext(level: number): number {
  return Math.round(CONFIG.XP_BASE * Math.pow(level, CONFIG.XP_EXP));
}

/**
 * Add XP and resolve any level-ups. Mutates a copy of hero's xp/level and
 * returns how many levels were gained (caller recomputes stats from level).
 */
export function applyXp(hero: Hero, xp: number): { hero: Hero; levelsGained: number } {
  let { level, xp: cur } = hero;
  cur += Math.max(0, xp);
  let gained = 0;
  while (cur >= xpToNext(level)) {
    cur -= xpToNext(level);
    level += 1;
    gained += 1;
  }
  return { hero: { ...hero, level, xp: cur }, levelsGained: gained };
}
