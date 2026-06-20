import { CONFIG, CLASSES } from "./constants.js";
import type { Gear, Hero, Stats } from "./types.js";
import type { RNG } from "../util/rng.js";

const KEYS = ["hp", "atk", "def", "crit"] as const;

/** Base stats from class + per-level growth (no gear). */
export function levelStats(hero: Hero): Stats {
  const c = CLASSES[hero.class];
  const lv = Math.max(0, hero.level - 1);
  return {
    hp: c.base.hp + c.growth.hp * lv,
    atk: c.base.atk + c.growth.atk * lv,
    def: c.base.def + c.growth.def * lv,
    crit: c.base.crit + c.growth.crit * lv,
  };
}

/** Level stats + equipped gear mods. */
export function effectiveStats(hero: Hero, gear: Gear): Stats {
  const s = levelStats(hero);
  for (const item of [gear.weapon, gear.armor, gear.trinket]) {
    if (!item) continue;
    for (const k of KEYS) s[k] += item.mods[k] ?? 0;
  }
  s.crit = Math.min(0.95, s.crit);
  return s;
}

export interface Mob {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  isBoss: boolean;
}

export function mobForFloor(floor: number): Mob {
  const g = Math.pow(CONFIG.MOB_GROWTH, Math.max(0, floor - 1));
  const isBoss = floor % CONFIG.BOSS_INTERVAL === 0;
  let hp = CONFIG.MOB_BASE_HP * g;
  let atk = CONFIG.MOB_BASE_ATK * g;
  const def = CONFIG.MOB_BASE_DEF * g;
  if (isBoss) {
    hp *= CONFIG.BOSS_HP_MULT;
    atk *= CONFIG.BOSS_ATK_MULT;
  }
  const maxHp = Math.round(hp);
  return { hp: maxHp, maxHp, atk, def, isBoss };
}

export function rollDamage(atk: number, def: number, crit: number, rng: RNG): { dmg: number; crit: boolean } {
  const isCrit = rng() < crit;
  let dmg = atk - def * 0.5;
  dmg *= 1 + (rng() * 2 - 1) * CONFIG.DAMAGE_VARIANCE;
  if (isCrit) dmg *= CONFIG.CRIT_MULT;
  return { dmg: Math.max(1, Math.round(dmg)), crit: isCrit };
}
