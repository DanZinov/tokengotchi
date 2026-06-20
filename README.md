# Tokengotchi (v0 prototype)

An idle auto-battler fueled by your real AI coding token usage. You code, your hero
levels up, gear drops, and the mobs get harder. This is the **v0 local prototype**
from the PRD — single-player, no backend, near-zero cost. Its only job is to answer
*"is the loop fun?"* before any infrastructure gets built.

**Phase 1 is 100% free** — the whole game, no paywall. The only "monetization" is an
optional in-game **♥ Support** panel (donations, never power). See [Donations](#donations).

What's in it: live token counter, three switchable **classes**, auto-equipping **gear**
with a loadout panel, **prestige** (reset for a permanent multiplier), a hero sprite that
**visibly evolves** with level and weapon rarity, and the full PixiJS juice stack.

## Install & run (the easy way)

Once published to npm, anyone can run the whole thing with one command — no clone, no
build. It reads your local AI-coding usage and opens the game in your browser:

```bash
npx tokengotchi            # reads real usage (Claude Code, Codex, …), serves on :7070
npx tokengotchi --mock     # fake usage, for a quick look without coding
```

Flags: `--mock`, `--port=7070`, `--interval=60000` (ms between syncs), `--no-open`
(don't auto-open anything), `--tab` (open a normal browser tab instead of an app window),
`--once` (one sync, print a summary, exit).

### Standalone window

By default Tokengotchi opens as a **chromeless app window** (via Chrome/Edge/Brave
`--app` mode) so it looks like a standalone app, not a browser tab — park it wherever you
like. If no Chromium browser is found, it falls back to your default browser; use `--tab`
to force that.

It's also an **installable PWA**: from the page, your browser's **Install** button (or
Safari → *File → Add to Dock* on macOS) gives it its own dock/taskbar icon and window.

The UI is fully responsive — shrink it into a side-strip next to your editor and the
arena scales to fit.

## Quickstart (from source)

```bash
npm install
npm run demo             # build the client + run with mock usage, opens the browser
```

**Dev (two terminals, with fake usage so you can see it move):**

```bash
npm run dev:engine     # terminal 1 — engine + WebSocket on :7070, --mock data
npm run dev:client     # terminal 2 — Vite client on :5173
# open http://localhost:5173/?ws=ws://localhost:7070
```

**Single command (real usage from Claude Code):**

```bash
npm run build          # builds the client into dist/
npm start              # reads ~/.claude/projects, serves game on http://localhost:7070
```

**One-shot sync (no UI, prints a summary):**

```bash
npm run sync:once -- --mock     # or omit --mock to read real usage
```

Other tests:

```bash
npm test          # engine math unit tests (deterministic, seeded)
npm run typecheck # tsc --noEmit
```

## How it works

```
usage logs on disk ──▶ UsageReader ──▶ engine.tick() ──▶ save.json
   (~/.claude/...)                          │
                                            ├─▶ tokens → energy  (streak-weighted; optional daily taper)
                                            ├─▶ runSession()      → combat event stream
                                            └─▶ WebSocket ──▶ Pixi client replays events with juice
```

The engine never *asks* a provider anything — it reads the JSONL logs the agents
already write locally (the same source ccusage/tokscale parse). Each read advances
an opaque cursor so re-running never double-counts.

The combat is an **event stream**: the engine resolves a whole session up front and
emits `attack / kill / advance / drop / levelup / defeat` events; the client replays
them with the §8.1 juice (hit flash, scale punch, knockback, damage numbers,
particles, screen shake, loot toasts).

## Usage readers

Each agent exposes usage differently, so every reader implements the same
`UsageReader` interface (`detect()` + `readSince(cursor)`) and manages its own opaque
cursor. Detected sources are read and summed each sync.

| Reader | Reads from | Notes |
|---|---|---|
| `claude-code` | `~/.claude/projects/**/*.jsonl` | Per-turn `usage` blocks; byte-offset cursor. |
| `codex` | `$CODEX_HOME/sessions/**/rollout-*.jsonl` (default `~/.codex`) | `token_count` events are **cumulative** per session, so we diff each file's latest total. |
| `gemini` | `$GEMINI_DATA_DIR/*/chats/*.{json,jsonl}` (default `~/.gemini/tmp`) | Per-message token stats; we re-sum and diff (handles rewritten `.json`). |
| `cursor` | Cursor's local `state.vscdb` (SQLite) | **Experimental.** Schema is undocumented and Auto mode hides the model. Needs Node ≥22.5 (`node:sqlite`) or `npm i better-sqlite3`; otherwise it stays inactive. Teams should prefer Cursor's Admin API. |

Env overrides for testing or non-standard installs: `CODEX_HOME`, `GEMINI_DATA_DIR`,
`CURSOR_CONFIG_DIR`. Adding another tool is one file implementing `UsageReader`, then a
line in `src/readers/index.ts`.

## The one knob that matters

`src/engine/conversion.ts` — tokens → energy is **streak-weighted**, so consistency
beats raw volume. It also supports a **sub-linear daily taper** (so burning 10× tokens
never gives 10× progress), which is the PRD's core anti-waste mechanic.

Phase 1 ships with the taper **off** (`DIMINISHING_RETURNS = false` in
`src/engine/constants.ts`) — conversion is **linear with no daily cap**, so the game
feels generous and the energy bar is never a wall. Flip that one constant to `true` to
re-enable the taper. Either way the streak multiplier keeps rewarding showing up. All
constants mirror PRD §13.

## Donations

Tokengotchi is free; the **♥ Support** button (top-right) opens a panel that links to
donation platforms. Donations are a thank-you and **never** buy power. To turn it on,
drop your handle into **`src/client/donate.config.ts`**:

```ts
const GITHUB_SPONSORS_USER = "your-github-username"; // → github.com/sponsors/...
const KOFI_HANDLE          = "";                     // → ko-fi.com/...
const BUYMEACOFFEE_HANDLE  = "";                     // → buymeacoffee.com/...
const CUSTOM_LINK          = "";                     // any URL (Stripe link, PayPal.me…)
```

Only the fields you fill in show up. GitHub Sponsors fits a dev audience best and works
even with a private repo (sponsorship is account-level), but needs one-time program
approval; **Ko-fi / Buy Me a Coffee are instant** to set up and also take real money.
No backend required — these are simply outbound links.

## Playing it

- **Pick a class** — Vibe Coder (crit/glass), Refactorer (tank/sustain), Architect
  (balanced). Switching is instant and safe; stats are derived from class + level + gear.
- **Gear** auto-equips when it's strictly better; the displaced item goes to your stash.
  The loadout panel shows what's equipped, color-coded by rarity.
- **Prestige** unlocks after the first boss (floor 10): reset the run for a permanent
  multiplier on damage, gold, and xp — the long-tail retention loop. Streak and lifetime
  tokens are preserved.

## Structure

```
src/
  engine/      pure, tested game math (conversion, combat, loot, progression, prestige, session)
  readers/     UsageReader interface + Claude Code / Codex / Gemini / Cursor + mock
  save/         ~/.tokengotchi/save.json load/save + forward migration
  cli/          reads usage, ticks engine, serves http + WebSocket, handles client commands
  client/       Pixi app (sprites, juice, event replay) + class/loadout/prestige UI + donate.config.ts
  util/         seeded RNG
test/           engine + reader unit tests (33)
public/assets/  placeholder-art note + where Kenney art drops in
```

## Art

Runs with zero downloaded assets (fighters drawn from Pixi primitives). To swap in
real CC0 art, see `public/assets/README.md`.

## Not in v0 (see PRD)

Accounts, cloud save, leaderboards, team mode, anti-cheat, and paid cosmetics — all
deferred to v1/v2. Prestige, classes, and gear (originally "Pro") are **free** here, and
usage readers for Cursor/Codex/Gemini are included.
