import { describe, it, expect } from "vitest";
import { streakMultiplier, tokensToEnergy } from "../src/engine/conversion.js";
import { effectiveStats, levelStats, mobForFloor, rollDamage } from "../src/engine/combat.js";
import { xpToNext, applyXp } from "../src/engine/progression.js";
import { rollDrop, itemPower, tryEquip } from "../src/engine/loot.js";
import { runSession } from "../src/engine/session.js";
import { tick } from "../src/engine/index.js";
import { canPrestige, prestige, prestigeGain } from "../src/engine/prestige.js";
import { newGame, migrate } from "../src/save/store.js";
import { extractTokens } from "../src/readers/types.js";
import { mulberry32 } from "../src/util/rng.js";
import { CONFIG } from "../src/engine/constants.js";

describe("conversion", () => {
  it("streak multiplier ramps from 1 to max and clamps", () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(CONFIG.STREAK_DAYS_TO_MAX)).toBeCloseTo(CONFIG.STREAK_MAX_MULT);
    expect(streakMultiplier(999)).toBeCloseTo(CONFIG.STREAK_MAX_MULT);
  });

  it("zero tokens yields zero energy", () => {
    expect(tokensToEnergy(0, 0, 1).energyGained).toBe(0);
  });

  it("is linear (no daily cap) by default — Phase 1 default", () => {
    const fresh = tokensToEnergy(10_000, 0, 0).energyGained;
    const later = tokensToEnergy(10_000, 400, 0).energyGained;
    expect(later).toBe(fresh); // energy already earned today doesn't reduce the next batch
    // 10× the tokens → exactly 10× the energy when diminishing returns are off
    expect(tokensToEnergy(100_000, 0, 0).energyGained).toBeCloseTo(fresh * 10);
  });

  it("returns are sub-linear within a day when diminishing returns are ON", () => {
    const fresh = tokensToEnergy(10_000, 0, 0, true).energyGained;
    const tired = tokensToEnergy(10_000, 400, 0, true).energyGained;
    expect(tired).toBeLessThan(fresh);
  });

  it("with diminishing ON, burning 10x tokens does NOT give 10x energy past the soft cap", () => {
    // simulate incremental accrual
    const accrue = (perCall: number, calls: number) => {
      let today = 0;
      let total = 0;
      for (let i = 0; i < calls; i++) {
        const r = tokensToEnergy(perCall, today, 0, true);
        today = r.energyTodayAfter;
        total += r.energyGained;
      }
      return total;
    };
    const normal = accrue(10_000, 1);
    const tenx = accrue(10_000, 10);
    expect(tenx).toBeLessThan(normal * 10);
  });
});

describe("combat", () => {
  it("mobs scale up by floor and bosses are flagged + tougher", () => {
    const f1 = mobForFloor(1);
    const f20 = mobForFloor(20);
    expect(f20.maxHp).toBeGreaterThan(f1.maxHp);
    const boss = mobForFloor(CONFIG.BOSS_INTERVAL);
    const near = mobForFloor(CONFIG.BOSS_INTERVAL - 1);
    expect(boss.isBoss).toBe(true);
    expect(boss.maxHp).toBeGreaterThan(near.maxHp);
  });

  it("damage is always at least 1", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      expect(rollDamage(1, 9999, 0, rng).dmg).toBeGreaterThanOrEqual(1);
    }
  });

  it("gear adds to effective stats", () => {
    const hero = newGame().hero;
    const base = levelStats(hero);
    const eff = effectiveStats(hero, {
      weapon: { id: "w", name: "x", slot: "weapon", rarity: "rare", mods: { atk: 10 } },
      armor: null,
      trinket: null,
    });
    expect(eff.atk).toBe(base.atk + 10);
  });
});

describe("progression", () => {
  it("xp curve is strictly increasing", () => {
    expect(xpToNext(2)).toBeGreaterThan(xpToNext(1));
    expect(xpToNext(10)).toBeGreaterThan(xpToNext(9));
  });

  it("applyXp levels up and carries remainder", () => {
    const hero = newGame().hero;
    const need = xpToNext(1);
    const res = applyXp(hero, need + 5);
    expect(res.levelsGained).toBe(1);
    expect(res.hero.level).toBe(2);
    expect(res.hero.xp).toBe(5);
  });
});

describe("loot", () => {
  it("respects drop rate (no drop when roll above rate)", () => {
    // rng() first call >= DROP_RATE → null
    const rng = () => 0.99;
    expect(rollDrop(5, rng)).toBeNull();
  });

  it("produces a valid item when it drops", () => {
    const rng = mulberry32(7);
    let item = null;
    for (let i = 0; i < 50 && !item; i++) item = rollDrop(10, rng);
    expect(item).not.toBeNull();
    expect(["weapon", "armor", "trinket"]).toContain(item!.slot);
  });

  it("auto-equips strictly better items and returns the displaced one", () => {
    const weak = { id: "a", name: "x", slot: "weapon", rarity: "common", mods: { atk: 1 } } as const;
    const strong = { id: "b", name: "y", slot: "weapon", rarity: "rare", mods: { atk: 20 } } as const;
    const gear = { weapon: weak, armor: null, trinket: null };
    const res = tryEquip(gear, strong);
    expect(res.equipped).toBe(true);
    expect(res.gear.weapon?.id).toBe("b");
    expect(res.replaced?.id).toBe("a");
    expect(itemPower(strong)).toBeGreaterThan(itemPower(weak));
  });
});

describe("session", () => {
  it("spends energy and clears floors with enough budget", () => {
    const s = newGame();
    s.hero.energy = 200;
    const res = runSession(s, mulberry32(3));
    expect(res.summary.energySpent).toBeGreaterThan(0);
    expect(res.summary.floorsCleared).toBeGreaterThan(0);
    expect(res.state.hero.energy).toBeLessThan(200);
  });

  it("does nothing with no energy", () => {
    const s = newGame();
    const res = runSession(s, mulberry32(3));
    expect(res.events.length).toBe(0);
    expect(res.summary.floorsCleared).toBe(0);
  });

  it("is deterministic for a fixed seed", () => {
    const a = runSession(Object.assign(newGame(), { hero: { ...newGame().hero, energy: 50 } }), mulberry32(42));
    const b = runSession(Object.assign(newGame(), { hero: { ...newGame().hero, energy: 50 } }), mulberry32(42));
    expect(a.summary).toEqual(b.summary);
  });

  it("prestige multiplier increases damage and rewards", () => {
    const seed = () => mulberry32(11);
    const plain = newGame();
    plain.hero.energy = 30;
    const boosted = newGame();
    boosted.hero.energy = 30;
    boosted.prestige.multiplier = 2;
    const a = runSession(plain, seed());
    const b = runSession(boosted, seed());
    expect(b.summary.floorsCleared).toBeGreaterThanOrEqual(a.summary.floorsCleared);
    expect(b.summary.gold).toBeGreaterThan(a.summary.gold);
  });
});

describe("mob HP persistence (no soft-lock)", () => {
  it("carries a wounded mob's HP into the save instead of resetting it", () => {
    const s = newGame("architect");
    s.progress.floor = 10; // a boss
    s.hero.energy = 3; // only a few hits — not enough to kill it
    const full = mobForFloor(10).maxHp;
    const res = runSession(s, mulberry32(5));
    expect(res.summary.floorsCleared).toBe(0); // didn't clear it
    expect(res.state.progress.mobHp).toBeGreaterThan(0);
    expect(res.state.progress.mobHp!).toBeLessThan(full); // but it was chipped, not reset
  });

  it("resumes the chipped boss next session (damage accumulates)", () => {
    const base = newGame("architect");
    base.progress.floor = 10;
    base.hero.energy = 3;
    const s1 = runSession(base, mulberry32(5)).state;
    const hpAfter1 = s1.progress.mobHp!;
    s1.hero.energy = 3; // another small session
    const s2 = runSession(s1, mulberry32(6)).state;
    // The boss kept its wounds — it's lower than after the first session.
    expect(s2.progress.mobHp!).toBeLessThan(hpAfter1);
  });

  it("a weak hero CAN eventually clear a boss across many small sessions", () => {
    let s = newGame("architect");
    s.progress.floor = 10;
    let cleared = false;
    for (let i = 0; i < 400 && !cleared; i++) {
      s.hero.energy += 4; // a trickle of energy each session
      s = runSession(s, mulberry32(200 + i)).state;
      if (s.progress.floor > 10) cleared = true; // got past the floor-10 boss
    }
    expect(cleared).toBe(true);
  });
});

describe("prestige", () => {
  it("is locked until the first boss floor, then unlocks", () => {
    const s = newGame();
    expect(canPrestige(s)).toBe(false);
    s.progress.floor = CONFIG.PRESTIGE_MIN_FLOOR;
    expect(canPrestige(s)).toBe(true);
  });

  it("resets the run but keeps streak/usage and grows the multiplier", () => {
    const s = newGame();
    s.progress = { zone: 4, floor: 37, bossesCleared: 3 };
    s.hero.level = 18;
    s.gold = 999;
    s.daily.streakDays = 9;
    s.usage.lifetimeTokens = 1_000_000;
    s.gear.weapon = { id: "w", name: "x", slot: "weapon", rarity: "rare", mods: { atk: 10 } };

    const gain = prestigeGain(s);
    const after = prestige(s);
    expect(after.prestige.count).toBe(1);
    expect(after.prestige.multiplier).toBeCloseTo(1 + gain);
    expect(after.progress.floor).toBe(1);
    expect(after.hero.level).toBe(1);
    expect(after.gold).toBe(0);
    expect(after.gear.weapon).toBeNull();
    // Real-world activity is preserved.
    expect(after.daily.streakDays).toBe(9);
    expect(after.usage.lifetimeTokens).toBe(1_000_000);
  });

  it("refuses to prestige before the minimum floor", () => {
    const s = newGame();
    const after = prestige(s);
    expect(after.prestige.count).toBe(0);
    expect(after.progress.floor).toBe(1);
  });
});

describe("save migration", () => {
  it("backfills prestige on an old v1 save without losing progress", () => {
    const old: any = {
      version: 1,
      hero: { class: "vibecoder", level: 12, xp: 40, energy: 3 },
      gear: { weapon: null, armor: null, trinket: null },
      inventory: [],
      gold: 50,
      progress: { zone: 2, floor: 19, bossesCleared: 1 },
      daily: { lastActiveDate: "2026-06-18", streakDays: 4, energyToday: 10 },
      usage: { cursors: {}, lifetimeTokens: 500 },
      createdAt: "2026-06-01T00:00:00.000Z",
      lastSyncAt: null,
    };
    const s = migrate(old);
    expect(s.version).toBe(2);
    expect(s.prestige).toEqual({ count: 0, multiplier: 1 });
    expect(s.progress.floor).toBe(19); // progress preserved
    expect(s.hero.level).toBe(12);
  });
});

describe("tick", () => {
  it("converts tokens, advances, and sets streak to 1 on first day", () => {
    const s = newGame();
    const res = tick(s, 50_000, new Date("2026-06-19T10:00:00"), mulberry32(9));
    expect(res.state.daily.streakDays).toBe(1);
    expect(res.state.usage.lifetimeTokens).toBe(50_000);
    expect(res.state.progress.floor).toBeGreaterThanOrEqual(1);
  });

  it("increments streak on consecutive days, resets on a gap", () => {
    let s = newGame();
    s = tick(s, 1000, new Date("2026-06-19T10:00:00"), mulberry32(1)).state;
    s = tick(s, 1000, new Date("2026-06-20T10:00:00"), mulberry32(1)).state;
    expect(s.daily.streakDays).toBe(2);
    s = tick(s, 1000, new Date("2026-06-25T10:00:00"), mulberry32(1)).state;
    expect(s.daily.streakDays).toBe(1);
  });
});

describe("usage token extraction", () => {
  it("sums component token fields", () => {
    const line = { message: { usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10 } } };
    expect(extractTokens(line)).toBe(160);
  });
  it("ignores lines without usage", () => {
    expect(extractTokens({ foo: "bar" })).toBe(0);
    expect(extractTokens(null)).toBe(0);
  });
});
