# Stage 2: Visual Evolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hero sprite visibly evolve as `level` climbs — gaining an outline, a weapon, an aura, wings, a crown, and orbiting orbs at level milestones — so Lv 500 looks earned, with zero new art.

**Architecture:** A pure `heroTier(level)` function (engine) returns boolean feature flags from level thresholds. The Pixi client reads those flags and draws each feature additively into the hero container. The hero is already drawn from Pixi primitives, so this is purely additive and keeps the existing `Fighter` shape stable.

**Tech Stack:** TypeScript, Vitest (seeded unit tests), Pixi.js v8 (Graphics primitives).

---

## File Structure

- **Create:** `src/engine/cosmetics.ts` — pure presentation derivation (this plan adds `heroTier`; later stages add `attackStyle`, `prestigeRank`, `zoneTheme` here).
- **Modify:** `src/client/sprites.ts` — `makeHero` adds a `decor` Graphics layer; `evolveHero` draws tier features.
- **Test:** `test/engine.test.ts` — add a `cosmetics` describe block.

The client already calls `evolveHero(hero, state.hero.level, weaponRarity)` on every state update (`src/client/main.ts` `applyState`), so no client-wiring change is needed — extending `evolveHero` is enough.

---

## Task 0: Restore the test runner (prerequisite)

The combat/curve stages need Vitest; this stage's `heroTier` test does too. Vitest/tsx hang in the current shell (a stuck esbuild service), so clear it before starting.

- [ ] **Step 1: Kill stuck services and reinstall from a fresh shell**

Run:
```bash
pkill -9 -f vitest; pkill -9 -f esbuild
cd /Users/danielzinovyev/Desktop/Projects/TokenForge
rm -rf node_modules/.vite node_modules/.cache
npm test
```
Expected: the suite runs and prints `Tests  36 passed`. If it still hangs, run `rm -rf node_modules && npm install` and retry, or open a brand-new terminal. **Do not proceed until `npm test` completes and is green.**

---

## Task 1: `heroTier(level)` pure function

**Files:**
- Create: `src/engine/cosmetics.ts`
- Test: `test/engine.test.ts` (add a `cosmetics` describe block)

- [ ] **Step 1: Write the failing test**

Add to `test/engine.test.ts` (add `import { heroTier } from "../src/engine/cosmetics.js";` to the imports at top):

```ts
describe("cosmetics: heroTier", () => {
  it("tier rises at the level thresholds", () => {
    expect(heroTier(1).tier).toBe(0);
    expect(heroTier(24).tier).toBe(0);
    expect(heroTier(25).tier).toBe(1);
    expect(heroTier(50).tier).toBe(2);
    expect(heroTier(100).tier).toBe(3);
    expect(heroTier(250).tier).toBe(4);
    expect(heroTier(500).tier).toBe(5);
    expect(heroTier(1000).tier).toBe(6);
    expect(heroTier(99999).tier).toBe(6);
  });

  it("unlocks features in order as tier climbs", () => {
    expect(heroTier(1).features).toEqual({
      outline: false, weapon: false, aura: false, wings: false, crown: false, orbs: false,
    });
    expect(heroTier(25).features.weapon).toBe(true);
    expect(heroTier(25).features.outline).toBe(true);
    expect(heroTier(50).features.aura).toBe(true);
    expect(heroTier(250).features.wings).toBe(true);
    expect(heroTier(500).features.crown).toBe(true);
    expect(heroTier(1000).features.orbs).toBe(true);
    expect(heroTier(500).features.orbs).toBe(false); // orbs are the Lv1000 tier
  });

  it("clamps and floors odd input", () => {
    expect(heroTier(0).tier).toBe(0);
    expect(heroTier(-5).tier).toBe(0);
    expect(heroTier(25.9).tier).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run -t "heroTier"`
Expected: FAIL — `Cannot find module '../src/engine/cosmetics.js'` / `heroTier is not defined`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/cosmetics.ts`:

```ts
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

// Level at which each tier index unlocks. Index 0 is the starting form.
const TIER_LEVELS = [1, 25, 50, 100, 250, 500, 1000];

/** Pure: derive the hero's visual tier + feature flags from its level. */
export function heroTier(level: number): HeroTier {
  const lv = Math.max(1, Math.floor(level || 1));
  let tier = 0;
  for (let i = 0; i < TIER_LEVELS.length; i++) {
    if (lv >= TIER_LEVELS[i]) tier = i;
  }
  return {
    tier,
    features: {
      outline: tier >= 1, // Lv 25
      weapon: tier >= 1,  // Lv 25
      aura: tier >= 2,    // Lv 50
      wings: tier >= 4,   // Lv 250
      crown: tier >= 5,   // Lv 500
      orbs: tier >= 6,    // Lv 1000
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run -t "heroTier"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/cosmetics.ts test/engine.test.ts
git commit -m "feat(cosmetics): heroTier level→feature flags"
```

---

## Task 2: Render tier features on the hero sprite

**Files:**
- Modify: `src/client/sprites.ts`

`makeHero` currently builds `{ view, aura, body, label }`. Add a `decor` Graphics layer (drawn above the body) for weapon/wings/crown/orbs, and have `evolveHero` redraw `decor` + the outline + aura from `heroTier(level)`.

- [ ] **Step 1: Add `decor` to the `Fighter` interface and `makeHero`**

In `src/client/sprites.ts`, change the `Fighter` interface:

```ts
export interface Fighter {
  view: Container;
  body: Graphics;
  label: Text;
  aura?: Graphics; // weapon-rarity glow ring + tier aura (hero only)
  decor?: Graphics; // tier features: weapon, wings, crown, orbs (hero only)
}
```

In `makeHero`, add the import and create the decor layer (add `heroTier` import at top of file: `import { heroTier } from "../engine/cosmetics.js";`):

```ts
export function makeHero(cls: ClassId): Fighter {
  const view = new Container();
  const aura = new Graphics(); // behind the body
  const body = new Graphics();
  const decor = new Graphics(); // tier features, above the body
  const color = CLASS_COLOR[cls] ?? 0x6cf0a0;
  body.roundRect(-26, -52, 52, 52, 8).fill(color);
  body.roundRect(-26, -52, 52, 52, 8).stroke({ color: 0xffffff, width: 2, alpha: 0.25 });
  body.circle(-9, -34, 4).fill(0x0a0e0c);
  body.circle(9, -34, 4).fill(0x0a0e0c);
  const label = makeLabel("Lv 1");
  label.y = 10;
  view.addChild(aura, body, decor, label);
  const f: Fighter = { view, body, label, aura, decor };
  evolveHero(f, 1, "none");
  return f;
}
```

- [ ] **Step 2: Extend `evolveHero` to draw tier features**

Replace the existing `evolveHero` body in `src/client/sprites.ts` with:

```ts
/**
 * Reflect progression on the hero sprite: it grows a touch with level (capped), gains a
 * weapon-rarity glow, and unlocks tier features (weapon, aura, wings, crown, orbs) at
 * level milestones. Code-drawn — no art required.
 */
export function evolveHero(f: Fighter, level: number, weaponRarity: string): void {
  const tier = heroTier(level).features;
  const rt = RARITY_TINT[weaponRarity] ?? RARITY_TINT.none;
  const grow = 1 + Math.min(0.28, Math.max(0, level - 1) * 0.012);

  // Aura: weapon-rarity glow, intensified once the Lv50 aura unlocks.
  if (f.aura) {
    f.aura.clear();
    const auraAlpha = rt.alpha + (tier.aura ? 0.25 : 0);
    const auraColor = rt.alpha > 0 ? rt.color : 0x6cf0a0;
    if (auraAlpha > 0) f.aura.roundRect(-34, -60, 68, 68, 12).fill({ color: auraColor, alpha: Math.min(0.85, auraAlpha) });
    f.aura.scale.set(grow);
  }

  // Decor: weapon, wings, crown, orbs.
  if (f.decor) {
    const d = f.decor;
    d.clear();
    if (tier.wings) {
      d.poly([-30, -44, -52, -28, -30, -16]).fill({ color: 0x6cb4f0, alpha: 0.55 });
      d.poly([30, -44, 52, -28, 30, -16]).fill({ color: 0x6cb4f0, alpha: 0.55 });
    }
    if (tier.weapon) {
      // a blade held to the hero's right
      d.poly([30, -40, 44, -48, 40, -24, 30, -20]).fill(0x9fbfae);
      d.poly([30, -40, 44, -48, 40, -24, 30, -20]).stroke({ color: 0xffffff, width: 1, alpha: 0.3 });
    }
    if (tier.crown) {
      d.poly([-16, -54, -10, -64, -2, -54, 6, -64, 14, -54, 16, -50, -18, -50]).fill(0xf0b46c);
    }
    if (tier.orbs) {
      d.circle(-40, -36, 4).fill(0xff5d9e);
      d.circle(42, -30, 4).fill(0x6cf0a0);
      d.circle(-36, 4, 4).fill(0x6cb4f0);
    }
    d.scale.set(grow);
  }

  f.body.scale.set(grow);
  f.label.text = `Lv ${level}`;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors (exit 0).

- [ ] **Step 4: Commit**

```bash
git add src/client/sprites.ts
git commit -m "feat(sprites): draw hero tier features (weapon/aura/wings/crown/orbs)"
```

---

## Task 3: Visual verification

**Files:** none (verification only).

- [ ] **Step 1: Build and launch with a high-level hero**

Run:
```bash
npm run build
node bin/tokengotchi.mjs --mock --no-open --interval=3000 --port=7073
```
The current save is already high-level (~Lv 20+); let it run a bit to climb further.

- [ ] **Step 2: Confirm the hero shows tier features**

Open `http://localhost:7073` (or screenshot it). Expected: at the save's level the hero shows the unlocked features (e.g. outline + weapon at ≥25, aura at ≥50). Switch class and confirm features persist. Stop the server when done (`pkill -f "tokengotchi.mjs"`).

- [ ] **Step 3: Commit any tuning tweaks** (if shape/positioning needed adjusting)

```bash
git add -A && git commit -m "chore(sprites): tune tier feature positions"
```

---

## Self-review notes

- **Spec coverage:** This plan implements the spec's "Stage 2 — Visual evolution" (heroTier thresholds 1/25/50/100/250/500/1000; features drawn in sprites.ts; reads level from state; Fighter shape preserved). Stages 1, 3, 4, 5 are separate plans.
- **Type consistency:** `heroTier` / `HeroFeatures` field names (`outline, weapon, aura, wings, crown, orbs`) are identical in cosmetics.ts, the test, and `evolveHero`.
- **No placeholders:** all code shown in full.
