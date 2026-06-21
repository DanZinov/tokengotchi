# Placeholder art

The game runs with **zero downloaded assets** — fighters and bars are drawn from
Pixi primitives in `src/client/sprites.ts`.

To swap in real art (recommended: **Kenney**, CC0 — free for commercial use, no
attribution required):

1. Download a pack (e.g. "Tiny Dungeon", "Tiny Battle") from https://kenney.nl
2. Drop the PNG sprite sheet(s) here in `/public/assets/`.
3. In `src/client/sprites.ts`, load them with `Assets.load(...)` and build an
   `AnimatedSprite` (or `Sprite`) instead of the placeholder `Graphics` body.
4. Keep the returned `{ view, body, label }` shape — nothing else needs to change.

If you generate art with an AI tool, double-check its license before shipping — several
only grant commercial rights on paid plans.
