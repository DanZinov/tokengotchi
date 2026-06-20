import { CONFIG } from "./constants.js";

/** 1.0 at streak 0, ramping linearly to STREAK_MAX_MULT at STREAK_DAYS_TO_MAX. */
export function streakMultiplier(streakDays: number): number {
  const t = Math.min(Math.max(streakDays, 0), CONFIG.STREAK_DAYS_TO_MAX) / CONFIG.STREAK_DAYS_TO_MAX;
  return 1 + (CONFIG.STREAK_MAX_MULT - 1) * t;
}

/**
 * Convert a token delta into energy.
 *
 * Two modes, chosen by `diminishing` (defaults to CONFIG.DIMINISHING_RETURNS):
 *  - diminishing OFF (Phase 1 default): linear + streak-weighted. No daily cap —
 *    every token always earns the same energy, scaled only by your streak.
 *  - diminishing ON: returns taper sub-linearly within a day past DAILY_SOFT_CAP,
 *    so burning 10× tokens never yields 10× progress (PRD §4.1 anti-waste).
 *
 * Either way the streak multiplier rewards consistency over raw volume.
 */
export function tokensToEnergy(
  tokensDelta: number,
  energyToday: number,
  streakDays: number,
  diminishing: boolean = CONFIG.DIMINISHING_RETURNS,
): { energyGained: number; energyTodayAfter: number } {
  const raw = Math.max(0, tokensDelta) / CONFIG.TOKENS_PER_ENERGY;
  const dailyFactor = diminishing ? 1 / (1 + Math.max(0, energyToday) / CONFIG.DAILY_SOFT_CAP) : 1;
  const energyGained = raw * dailyFactor * streakMultiplier(streakDays);
  return { energyGained, energyTodayAfter: energyToday + energyGained };
}
