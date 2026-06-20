import type { ClassId, Stats, Rarity } from "./types.js";

// All of these are placeholders to be tuned during the v0 "is it fun?" phase.
// They mirror the PRD §13 appendix.
export const CONFIG = {
  // conversion
  TOKENS_PER_ENERGY: 1000,
  // Anti-waste taper. When DIMINISHING_RETURNS is true, energy earned within a day
  // tapers sub-linearly past DAILY_SOFT_CAP (PRD §4.1/§9). Phase 1 ships with it OFF
  // (linear, no cap) — flip to true to re-enable the taper. The streak bonus below
  // still rewards consistency over raw volume either way.
  DIMINISHING_RETURNS: false,
  DAILY_SOFT_CAP: 200, // energy/day where returns taper (only when DIMINISHING_RETURNS)
  STREAK_MAX_MULT: 1.5,
  STREAK_DAYS_TO_MAX: 14,

  // prestige (free in Phase 1; was a Pro feature in the PRD)
  PRESTIGE_MIN_FLOOR: 10, // must clear the first boss before you can prestige
  PRESTIGE_MULT_PER_FLOOR: 0.01, // permanent multiplier gained per floor reached at prestige
  PRESTIGE_RANK_FACTOR: 1.5, // multiplier compounds ×this each prestige (deep-game pacing)

  // attack styles (Stage 3) — unlock levels + the damage spike each one grants
  RANGED_LEVEL: 40,
  MULTISHOT_LEVEL: 120,
  BEAM_LEVEL: 300,
  ATTACK_STYLE_DMG: { melee: 1, ranged: 1.05, multishot: 1.4, beam: 1.25 },
  BEAM_CRIT_BONUS: 0.15, // beam style adds this to crit chance

  // milestones (Stage 5)
  MILESTONE_DROP_INTERVAL: 25, // guaranteed rare-or-better drop every N floors

  // combat economy
  ENERGY_PER_TICK: 1, // one round per energy

  // mobs
  MOB_BASE_HP: 30,
  MOB_BASE_ATK: 8,
  MOB_BASE_DEF: 2,
  MOB_GROWTH: 1.06, // per floor
  BOSS_INTERVAL: 10,
  BOSS_HP_MULT: 4,
  BOSS_ATK_MULT: 1.6,

  // damage
  CRIT_MULT: 2,
  DAMAGE_VARIANCE: 0.1, // +/- 10%
  MAX_HIT_FRACTION: 0.3, // a single mob hit can't exceed 30% of the hero's max HP (no one-shots)

  // loot
  DROP_RATE: 0.15,

  // progression
  XP_BASE: 50,
  XP_EXP: 1.5,

  // economy
  GOLD_BASE: 5,
  GOLD_GROWTH: 1.05,
  XP_PER_KILL_BASE: 12,
  XP_PER_KILL_GROWTH: 1.05,
} as const;

export const CLASSES: Record<ClassId, { name: string; base: Stats; growth: Stats }> = {
  vibecoder: {
    name: "Vibe Coder",
    base: { hp: 80, atk: 12, def: 3, crit: 0.15 },
    growth: { hp: 14, atk: 3, def: 0.6, crit: 0.004 },
  },
  refactorer: {
    name: "Refactorer",
    base: { hp: 130, atk: 8, def: 6, crit: 0.05 },
    growth: { hp: 24, atk: 1.8, def: 1.4, crit: 0.002 },
  },
  architect: {
    name: "Architect",
    base: { hp: 100, atk: 10, def: 4, crit: 0.1 },
    growth: { hp: 18, atk: 2.4, def: 1.0, crit: 0.003 },
  },
};

export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
