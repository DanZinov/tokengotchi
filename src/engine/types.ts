export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type Slot = "weapon" | "armor" | "trinket";
export type ClassId = "vibecoder" | "refactorer" | "architect";
export type AttackStyle = "melee" | "ranged" | "multishot" | "beam";

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  crit: number; // 0..1 probability
}

export interface Item {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  mods: Partial<Stats>;
}

export interface Gear {
  weapon: Item | null;
  armor: Item | null;
  trinket: Item | null;
}

export interface Hero {
  class: ClassId;
  level: number;
  xp: number;
  energy: number; // accumulated energy pool (float); spent as whole ticks
}

export interface Progress {
  zone: number;
  floor: number;
  bossesCleared: number;
  /** Remaining HP of the current floor's mob, carried across sessions so damage
   *  accumulates (a tough boss gets worn down instead of resetting). Undefined = full. */
  mobHp?: number;
}

export interface DailyState {
  lastActiveDate: string | null; // YYYY-MM-DD (local)
  streakDays: number;
  energyToday: number;
}

export interface UsageState {
  cursors: Record<string, string>; // readerId -> opaque cursor
  lifetimeTokens: number;
}

export interface PrestigeState {
  count: number; // how many times you've prestiged
  multiplier: number; // permanent multiplier on damage + gold + xp (1.0 = none)
}

export interface GameState {
  version: number;
  hero: Hero;
  gear: Gear;
  inventory: Item[];
  gold: number;
  progress: Progress;
  daily: DailyState;
  usage: UsageState;
  prestige: PrestigeState;
  createdAt: string;
  lastSyncAt: string | null;
}

export type CombatEvent =
  | { type: "attack"; who: "hero" | "mob"; dmg: number; crit: boolean; style?: AttackStyle; targetHpAfter: number; targetMaxHp: number }
  | { type: "kill"; floor: number; isBoss: boolean }
  | { type: "advance"; floor: number }
  | { type: "drop"; item: Item; equipped: boolean }
  | { type: "levelup"; level: number }
  | { type: "milestone"; floor: number; zoneName: string }
  | { type: "stalled"; floor: number; mobHpPct: number };

export interface SessionSummary {
  energySpent: number;
  floorsCleared: number;
  gold: number;
  xpGained: number;
  drops: Item[];
  levelsGained: number;
  defeated: boolean;
}

export interface TickResult {
  events: CombatEvent[];
  summary: SessionSummary;
  /** Raw tokens folded in this tick and the energy they converted to (for live UI). */
  tokensApplied: number;
  energyGained: number;
  state: GameState;
}
