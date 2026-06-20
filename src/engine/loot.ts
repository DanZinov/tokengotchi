import { CONFIG, RARITIES } from "./constants.js";
import type { Gear, Item, Rarity, Slot, Stats } from "./types.js";
import type { RNG } from "../util/rng.js";

const SLOTS: Slot[] = ["weapon", "armor", "trinket"];

/** Options for milestone/guaranteed drops. */
export interface DropOpts {
  guaranteed?: boolean; // skip the drop-rate gate (always drops)
  minRarity?: Rarity; // floor the rarity at this tier
}

const NAMES: Record<Slot, string[]> = {
  weapon: ["Compiler Blade", "Null Pointer", "Stack Smasher", "Regex Lance", "Merge Hammer", "Segfault Edge"],
  armor: ["Firewall Plate", "Cache Cloak", "Sandbox Shell", "Buffer Vest", "Try-Catch Mail", "Mutex Guard"],
  trinket: ["Lucky Bit", "Heap Charm", "Token Sigil", "Hotfix Locket", "Daemon Eye", "Async Amulet"],
};

const RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.6,
  rare: 2.6,
  epic: 4,
  legendary: 6.5,
};

// Base weights; higher floors nudge probability toward better rarities.
const BASE_WEIGHTS: [Rarity, number][] = [
  ["common", 60],
  ["uncommon", 25],
  ["rare", 10],
  ["epic", 4],
  ["legendary", 1],
];

function weightedRarity(floor: number, rng: RNG): Rarity {
  const luck = Math.min(1.5, floor / 60); // ramps the upside with depth
  const weights = BASE_WEIGHTS.map(([r, w], i) => [r, w * (1 + luck * i * 0.4)] as [Rarity, number]);
  const total = weights.reduce((a, [, w]) => a + w, 0);
  let roll = rng() * total;
  for (const [r, w] of weights) {
    roll -= w;
    if (roll <= 0) return r;
  }
  return "common";
}

/** Single scalar used to compare items for auto-equip. */
export function itemPower(item: Item | null): number {
  if (!item) return 0;
  const m = item.mods;
  return (m.atk ?? 0) * 2 + (m.def ?? 0) * 2 + (m.hp ?? 0) * 0.25 + (m.crit ?? 0) * 200;
}

export function rollDrop(floor: number, rng: RNG, opts?: DropOpts): Item | null {
  if (!opts?.guaranteed && rng() >= CONFIG.DROP_RATE) return null;
  const slot = SLOTS[Math.floor(rng() * SLOTS.length)];
  let rarity = weightedRarity(floor, rng);
  if (opts?.minRarity && RARITIES.indexOf(opts.minRarity) > RARITIES.indexOf(rarity)) {
    rarity = opts.minRarity;
  }
  const power = (1 + floor * 0.15) * RARITY_MULT[rarity];

  let mods: Partial<Stats>;
  if (slot === "weapon") {
    mods = { atk: Math.round(2 * power), crit: +(0.01 * RARITY_MULT[rarity]).toFixed(3) };
  } else if (slot === "armor") {
    mods = { hp: Math.round(8 * power), def: Math.max(1, Math.round(1 * power)) };
  } else {
    mods = { atk: Math.round(1 * power), hp: Math.round(4 * power), crit: +(0.015 * RARITY_MULT[rarity]).toFixed(3) };
  }

  const pool = NAMES[slot];
  const name = pool[Math.floor(rng() * pool.length)];
  const id = "itm_" + Math.floor(rng() * 1e9).toString(36);
  return { id, name, slot, rarity, mods };
}

/** Auto-equip if strictly better; returns the displaced item (if any) for the inventory. */
export function tryEquip(gear: Gear, item: Item): { gear: Gear; replaced: Item | null; equipped: boolean } {
  const current = gear[item.slot];
  if (itemPower(item) <= itemPower(current)) {
    return { gear, replaced: null, equipped: false };
  }
  const next: Gear = { ...gear, [item.slot]: item };
  return { gear: next, replaced: current, equipped: true };
}
