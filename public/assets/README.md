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

For the AI-generated long tail (item icons, enemy/gear variants, cosmetic skins),
see PRD §8.3. Confirm each tool's commercial license before shipping; free tiers
often don't grant commercial rights.
