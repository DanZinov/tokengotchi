# Tokengotchi — Deep Progression ("Ascension") Design

**Date:** 2026-06-20
**Status:** Approved design, pre-implementation
**Owner:** Daniil

## Goal

Make long-term progression feel accomplishing and visually satisfying. Today the math is
infinite but the *experience* flatlines: the hero stops changing visually ~Lv 24, combat
is one move forever, prestige is just a multiplier, and nothing special happens at
milestones. Floor 500 looks and plays exactly like floor 100.

This adds **visible evolution, combat variety, prestige identity, and milestone
landmarks** so the deep game feels earned — without requiring any art (everything is
code-drawn).

## The spine: the "Ascension" model

Two numbers that already exist drive everything:

- **`hero.level`** — drives the hero's *form* and *abilities* within a run.
- **`prestige.count` (rank)** — drives the hero's *identity* across runs (color + badge)
  and a compounding power multiplier.

All presentation is derived by **pure functions** in the engine; the client only renders
the result. Combat math stays deterministic and unit-testable (seeded RNG, as today).

## Stage 1 — Curve & numbers (foundation)

- **Big-number formatting.** New `src/engine/format.ts` → `formatNum(n)` with suffixes
  (K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc). Display-only; the engine stays numeric.
  Replaces the ad-hoc `fmtTokens` in the client and is used for damage numbers, gold,
  HP, and tokens.
- **Power pacing.** Keep `mob_stat = base * MOB_GROWTH^floor`. Hero effective power =
  (class + level growth + gear) × prestige multiplier × ability multiplier. The Stage-3
  ability unlocks are deliberate ~1.15–1.4× DPS spikes at their thresholds so the player
  *surges* past walls instead of grinding. Tune `XP_BASE/XP_EXP` and kill-XP growth so
  leveling keeps pace with floor scaling.
- **Prestige multiplier.** Currently `+= floor * PRESTIGE_MULT_PER_FLOOR`. Change to
  *compound per rank*: `multiplier = base * PRESTIGE_RANK_FACTOR^count` (e.g. 1.5×) plus
  the existing floor bonus, so each reset climbs noticeably faster and deeper.
- *Why first:* every later pillar reads these numbers.

## Stage 2 — Visual evolution

- **`heroTier(level)`** in a new pure `src/engine/cosmetics.ts` → `{ tier, features }`
  where features = `{ outline, weapon, aura, wings, crown, orbs }`, keyed to thresholds
  `[1, 25, 50, 100, 250, 500, 1000]`.
- **Rendering.** Extend `sprites.ts` `makeHero` / `evolveHero` to draw each feature
  (outline trim, weapon polygon, aura ring, wing polygons, crown, orbiting orbs). The
  hero is already drawn from Pixi primitives, so this is purely additive. Tier is taken
  from `state.hero.level` on each state update. Keep the returned
  `{ view, body, label, aura }` shape stable so juice/layout keep working.

## Stage 3 — Combat evolution (attack styles — "shooting at mobs")

- **`attackStyle(level)`** (pure, cosmetics.ts) → `"melee" | "ranged" | "multishot" |
  "beam"` at thresholds melee(1) → ranged(40) → multishot(120) → beam(300).
- **Engine.** `runSession`/`combat.ts` tags each hero `attack` event with `style`.
  `multishot` resolves an extra strike per tick; `beam` carries a higher crit/AoE flavor.
  Per-style damage modifiers are small, tunable constants. Mob attacks unchanged.
- **Client.** `juice.ts` gains `projectile(layer, from, to, color)` (hero→mob tween) and
  `beam(...)`. `handle()` switches the effect on `ev.style`. `CombatEvent` attack variant
  gains an optional `style`.

## Stage 4 — Prestige ranks

- **`prestigeRank(count)`** (pure, cosmetics.ts) → `{ name, color, badge }` from a ranks
  table: Recruit → Bronze → Silver → Gold → Platinum → Diamond → Mythic → … (beyond the
  last entry, repeat the top rank with a numeric suffix, e.g. "Mythic II").
- **Rendering.** HUD prestige stat shows the rank name + badge; the hero body/aura tint
  blends toward the rank color. Mechanical side = the compounding multiplier from Stage 1.

## Stage 5 — Milestone zones & rewards

- **`zoneTheme(zone)`** (pure, cosmetics.ts), `zone = floor((floor-1)/BOSS_INTERVAL)` →
  `{ name, bg, mobColor }` cycling a themed palette list.
- **Backdrop.** A `Graphics` rect behind `world` tinted per zone, updated on zone change;
  mob color comes from the theme.
- **Milestone rewards.** On each boss kill (every `BOSS_INTERVAL` floors) emit a
  `milestone` event → a "Floor N: ‹zone name›" toast + a **guaranteed** drop. Add a
  `minRarity`/`guaranteed` path to `rollDrop`; guarantee rare-or-better every 25 floors.
- **Events.** `CombatEvent` gains `{ type: "milestone", floor, zoneName }`.

## Data model changes

- `CombatEvent`: add optional `style` to the `attack` variant; add a `milestone` variant.
- No new **persisted** save fields required — tier / rank / zone derive from
  `level` / `prestige.count` / `floor` at read time. (`progress.mobHp` already exists.)
- New tuning constants centralized in `constants.ts` (ability thresholds, per-style
  modifiers, `PRESTIGE_RANK_FACTOR`); descriptive tables (rank list, zone palette, tier
  thresholds) live in `cosmetics.ts`.

## Affected files

- **New:** `src/engine/format.ts`, `src/engine/cosmetics.ts`.
- **Engine:** `constants.ts` (tuning), `session.ts` + `combat.ts` (attack style,
  multishot, milestone, guaranteed drops), `types.ts` (CombatEvent), `loot.ts`
  (`minRarity`), `prestige.ts` (compounding multiplier).
- **Client:** `sprites.ts` (evolution features, rank tint), `juice.ts` (projectile/beam),
  `client/main.ts` (render style, milestone, zone backdrop, rank badge, `formatNum`),
  `index.html` (rank badge HUD slot).
- **Tests:** `test/engine.test.ts` (+ cosmetics, attack style, multishot, prestige
  compounding, format, milestone, guaranteed drops).

## Testing approach

Pure functions (`formatNum`, `heroTier`, `attackStyle`, `prestigeRank`, `zoneTheme`) are
unit-tested deterministically. Combat: a seeded `runSession` asserts correct style
emission at given levels, multishot hit counts, milestone events on boss floors, and
guaranteed drops at milestone floors. Curve: assert a post-prestige run reaches deeper
than the previous one within N sessions (faster re-climb, no soft-lock). All via the
existing seeded vitest setup.

## Build order

Stage 1 → 2 → 3 → 4 → 5, each independently shippable and playable. (Stage 2 + 3 may be
pulled forward for the visible payoff if desired.) Version bumps per stage or batch; each
stage is a candidate `npm publish`.

## Constraints / risks

- **Test runner (gating).** vitest/tsx currently will not execute in this environment
  (the esbuild service hangs and produces no output), while `tsc`, `vite build`, and the
  bundled `bin` run fine. Stages 1 & 3 are math-heavy and must be built with tests
  runnable. Resolve the runner (fresh shell / reinstall / different machine) before
  implementing those stages; non-math stages (2, 4, 5 rendering) can proceed on typecheck
  + visual verification if needed.
- **Visual additivity.** Keep the `sprites.ts` fighter return shape stable so existing
  juice and layout keep working.
- **Performance.** Orbs/beam/projectile particles are bounded and reuse the existing
  GSAP particle approach.
