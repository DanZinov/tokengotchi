import type { AttackStyle } from "./types.js";
import { CONFIG } from "./constants.js";

// Pure derivation of all "presentation" from level / prestige / zone. No rendering here —
// the client reads these and draws them. Keeping it pure keeps it trivially testable.

// ── Hero visual tiers (Stage 2) ──────────────────────────────────────────────
export interface HeroFeatures {
  outline: boolean;
  weapon: boolean;
  aura: boolean;
  wings: boolean;
  crown: boolean;
  orbs: boolean;
}
export interface HeroTier {
  tier: number; // 0..6
  features: HeroFeatures;
}

const TIER_LEVELS = [1, 25, 50, 100, 250, 500, 1000];

/** Derive the hero's visual tier + feature flags from its level. */
export function heroTier(level: number): HeroTier {
  const lv = Math.max(1, Math.floor(level || 1));
  let tier = 0;
  for (let i = 0; i < TIER_LEVELS.length; i++) if (lv >= TIER_LEVELS[i]) tier = i;
  return {
    tier,
    features: {
      outline: tier >= 1, // Lv 25
      weapon: tier >= 1, // Lv 25
      aura: tier >= 2, // Lv 50
      wings: tier >= 4, // Lv 250
      crown: tier >= 5, // Lv 500
      orbs: tier >= 6, // Lv 1000
    },
  };
}

// ── Attack styles (Stage 3) ──────────────────────────────────────────────────
const STYLE_THRESHOLDS: [AttackStyle, number][] = [
  ["beam", CONFIG.BEAM_LEVEL],
  ["multishot", CONFIG.MULTISHOT_LEVEL],
  ["ranged", CONFIG.RANGED_LEVEL],
];

/** The hero's unlocked attack style for a given level. */
export function attackStyle(level: number): AttackStyle {
  const lv = Math.max(1, Math.floor(level || 1));
  for (const [style, min] of STYLE_THRESHOLDS) if (lv >= min) return style;
  return "melee";
}

// ── Prestige ranks (Stage 4) ─────────────────────────────────────────────────
export interface PrestigeRankInfo {
  name: string;
  color: number;
  badge: string;
}
const RANKS: PrestigeRankInfo[] = [
  { name: "Recruit", color: 0x9fbfae, badge: "·" },
  { name: "Bronze", color: 0xcd7f32, badge: "▲" },
  { name: "Silver", color: 0xc0c8d0, badge: "◆" },
  { name: "Gold", color: 0xf0b46c, badge: "★" },
  { name: "Platinum", color: 0x8fe7d6, badge: "✦" },
  { name: "Diamond", color: 0x6cb4f0, badge: "❖" },
  { name: "Mythic", color: 0xff5d9e, badge: "✷" },
];
const NUMERAL = ["", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"];

/** Map a prestige count to a named rank (color + badge). Beyond the table, the top rank
 *  repeats with a numeral suffix (Mythic II, Mythic III, …). */
export function prestigeRank(count: number): PrestigeRankInfo {
  const c = Math.max(0, Math.floor(count || 0));
  if (c < RANKS.length) return RANKS[c];
  const top = RANKS[RANKS.length - 1];
  const over = c - (RANKS.length - 1);
  const suffix = over < NUMERAL.length ? NUMERAL[over] : ` ${over + 1}`;
  return { ...top, name: top.name + suffix };
}

// ── Zone themes (Stage 5) ────────────────────────────────────────────────────
export interface ZoneTheme {
  name: string;
  bg: number; // arena backdrop tint
  mobColor: number;
}
const ZONES: ZoneTheme[] = [
  { name: "The Sandbox", bg: 0x0a0e0c, mobColor: 0xe0824a },
  { name: "Null Caverns", bg: 0x0d0a14, mobColor: 0xb06cf0 },
  { name: "The Heap", bg: 0x0a1410, mobColor: 0x57c98a },
  { name: "Race Condition", bg: 0x140f0a, mobColor: 0xf0b46c },
  { name: "Deadlock Depths", bg: 0x0a0f18, mobColor: 0x6cb4f0 },
  { name: "The Mainframe", bg: 0x140a10, mobColor: 0xff5d6c },
];

/** Theme for a 1-based zone number; cycles through the palette as you climb. */
export function zoneTheme(zone: number): ZoneTheme {
  const z = Math.max(1, Math.floor(zone || 1));
  return ZONES[(z - 1) % ZONES.length];
}
