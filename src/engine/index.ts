import { tokensToEnergy } from "./conversion.js";
import { runSession } from "./session.js";
import type { GameState, TickResult } from "./types.js";
import type { RNG } from "../util/rng.js";

const clone = <T>(x: T): T => structuredClone(x);

function dateKey(d: Date): string {
  // Local calendar day, YYYY-MM-DD.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayDiff(a: string, b: string): number {
  const ms = new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}

/**
 * The one entry point. Folds a token delta into the game: updates streak + daily
 * bucket, converts tokens → energy, then runs a combat session with that energy.
 */
export function tick(state: GameState, tokensDelta: number, now: Date, rng: RNG): TickResult {
  const s = clone(state);
  const today = dateKey(now);

  // Daily reset + streak update (once per active calendar day).
  if (s.daily.lastActiveDate !== today) {
    if (s.daily.lastActiveDate && dayDiff(s.daily.lastActiveDate, today) === 1) {
      s.daily.streakDays += 1;
    } else {
      s.daily.streakDays = 1;
    }
    s.daily.lastActiveDate = today;
    s.daily.energyToday = 0;
  }

  // Convert tokens → energy (streak-weighted; linear unless DIMINISHING_RETURNS is on).
  const conv = tokensToEnergy(tokensDelta, s.daily.energyToday, s.daily.streakDays);
  s.hero.energy += conv.energyGained;
  s.daily.energyToday = conv.energyTodayAfter;
  s.usage.lifetimeTokens += Math.max(0, tokensDelta);

  // Spend it.
  const ran = runSession(s, rng);
  ran.state.lastSyncAt = now.toISOString();
  return {
    events: ran.events,
    summary: ran.summary,
    tokensApplied: Math.max(0, tokensDelta),
    energyGained: conv.energyGained,
    state: ran.state,
  };
}
