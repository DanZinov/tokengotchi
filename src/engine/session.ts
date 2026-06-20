import { CONFIG } from "./constants.js";
import { effectiveStats, mobForFloor, rollDamage, type Mob } from "./combat.js";
import { rollDrop, tryEquip } from "./loot.js";
import { applyXp } from "./progression.js";
import { attackStyle, zoneTheme } from "./cosmetics.js";
import type { CombatEvent, GameState, SessionSummary } from "./types.js";
import type { RNG } from "../util/rng.js";

const clone = <T>(x: T): T => structuredClone(x);

function killReward(floor: number): { gold: number; xp: number } {
  const g = Math.pow(CONFIG.GOLD_GROWTH, floor - 1);
  const x = Math.pow(CONFIG.XP_PER_KILL_GROWTH, floor - 1);
  return {
    gold: Math.round(CONFIG.GOLD_BASE * g),
    xp: Math.round(CONFIG.XP_PER_KILL_BASE * x),
  };
}

function zoneFor(floor: number): number {
  return Math.floor((floor - 1) / CONFIG.BOSS_INTERVAL) + 1;
}

/**
 * Spend the hero's accumulated energy as combat rounds. The hero regenerates to
 * full at the start of each session; a defeat just stalls progress (soft wall),
 * it never resets anything. Returns the full event stream for the client to replay.
 */
export function runSession(state: GameState, rng: RNG): { events: CombatEvent[]; summary: SessionSummary; state: GameState } {
  const next = clone(state);
  const events: CombatEvent[] = [];
  const summary: SessionSummary = {
    energySpent: 0,
    floorsCleared: 0,
    gold: 0,
    xpGained: 0,
    drops: [],
    levelsGained: 0,
    defeated: false,
  };

  const ticks = Math.floor(next.hero.energy / CONFIG.ENERGY_PER_TICK);
  if (ticks <= 0) return { events, summary, state: next };

  // Prestige permanently boosts hero damage and rewards (the reason to reset and reclimb).
  const mult = next.prestige.multiplier;
  let es = effectiveStats(next.hero, next.gear);
  let heroMax = Math.round(es.hp);
  let heroHp = heroMax;
  let mob: Mob = mobForFloor(next.progress.floor);
  // Resume a wounded mob from a previous session so damage accumulates (no soft-lock on
  // a boss you can't kill in one life — your hero wears it down over time).
  if (typeof next.progress.mobHp === "number" && next.progress.mobHp > 0 && next.progress.mobHp < mob.maxHp) {
    mob.hp = next.progress.mobHp;
  }

  for (let i = 0; i < ticks; i++) {
    next.hero.energy -= CONFIG.ENERGY_PER_TICK;
    summary.energySpent += CONFIG.ENERGY_PER_TICK;

    // Hero strikes. The unlocked attack style (by level) gives a small damage spike and
    // drives the visual (melee lunge / ranged shot / multishot / beam) on the client.
    const style = attackStyle(next.hero.level);
    const styleDmg = CONFIG.ATTACK_STYLE_DMG[style];
    const critChance = es.crit + (style === "beam" ? CONFIG.BEAM_CRIT_BONUS : 0);
    const h = rollDamage(es.atk * mult * styleDmg, mob.def, critChance, rng);
    mob.hp -= h.dmg;
    events.push({ type: "attack", who: "hero", dmg: h.dmg, crit: h.crit, style, targetHpAfter: Math.max(0, mob.hp), targetMaxHp: mob.maxHp });

    if (mob.hp <= 0) {
      const floor = next.progress.floor;
      events.push({ type: "kill", floor, isBoss: mob.isBoss });
      if (mob.isBoss) {
        next.progress.bossesCleared += 1;
        // Zone landmark beat (every boss = a new zone).
        events.push({ type: "milestone", floor, zoneName: zoneTheme(zoneFor(floor)).name });
      }

      const reward = killReward(floor);
      const gold = Math.round(reward.gold * mult);
      const xp = Math.round(reward.xp * mult);
      next.gold += gold;
      summary.gold += gold;

      // XP + level-ups (recompute stats if we leveled mid-session).
      const before = next.hero.level;
      const xpRes = applyXp(next.hero, xp);
      next.hero = xpRes.hero;
      summary.xpGained += xp;
      if (xpRes.levelsGained > 0) {
        summary.levelsGained += xpRes.levelsGained;
        for (let l = before + 1; l <= next.hero.level; l++) events.push({ type: "levelup", level: l });
        es = effectiveStats(next.hero, next.gear);
        heroMax = Math.round(es.hp);
        heroHp = Math.min(heroMax, heroHp + Math.round(heroMax * 0.25)); // small heal on level
      }

      // Loot — guaranteed rare-or-better at milestone floors (every 25th).
      const milestone = floor % CONFIG.MILESTONE_DROP_INTERVAL === 0;
      const drop = rollDrop(floor, rng, milestone ? { guaranteed: true, minRarity: "rare" } : undefined);
      if (drop) {
        const eq = tryEquip(next.gear, drop);
        next.gear = eq.gear;
        if (eq.equipped) {
          es = effectiveStats(next.hero, next.gear);
          heroMax = Math.round(es.hp);
          if (eq.replaced) next.inventory.push(eq.replaced);
        } else {
          next.inventory.push(drop);
        }
        summary.drops.push(drop);
        events.push({ type: "drop", item: drop, equipped: eq.equipped });
      }

      // Advance.
      next.progress.floor += 1;
      next.progress.zone = zoneFor(next.progress.floor);
      summary.floorsCleared += 1;
      events.push({ type: "advance", floor: next.progress.floor });
      mob = mobForFloor(next.progress.floor);
      continue; // dead mob doesn't counterattack
    }

    // Mob strikes back. Cap a single hit so even a frontier boss can't one-shot the hero —
    // the HP bar visibly drains over several rounds instead of snapping to empty.
    const m = rollDamage(mob.atk, es.def, 0, rng);
    const dmg = Math.min(m.dmg, Math.ceil(heroMax * CONFIG.MAX_HIT_FRACTION));
    heroHp -= dmg;
    events.push({ type: "attack", who: "mob", dmg, crit: false, targetHpAfter: Math.max(0, heroHp), targetMaxHp: heroMax });

    if (heroHp <= 0) {
      // The hero falls — but gets back up while energy remains and keeps chipping the
      // (persistent) mob. Energy always = progress; no hard wall, and no per-death spam.
      // The soft wall is simply running out of energy until you code more.
      heroHp = heroMax;
    }
  }

  // Carry the current mob's remaining HP into the save so the next session continues
  // the fight instead of resetting it (this is what un-sticks unbeatable bosses).
  next.progress.mobHp = Math.max(0, Math.round(mob.hp));

  // "Stuck" = spent energy this session but cleared no floors (e.g. wearing down a wall
  // boss). Surface ONE quiet progress beat — not a per-death "out of energy" toast.
  summary.defeated = summary.floorsCleared === 0 && summary.energySpent > 0;
  if (summary.defeated) {
    events.push({ type: "stalled", floor: next.progress.floor, mobHpPct: mob.maxHp ? Math.max(0, mob.hp) / mob.maxHp : 1 });
  }

  return { events, summary, state: next };
}
