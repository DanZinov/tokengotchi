import { Container, Graphics, Text } from "pixi.js";
import type { ClassId } from "../engine/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDER ART. These build fighters/bars from Pixi primitives so the game
// runs with zero downloaded assets. To swap in real Kenney art (CC0):
//   1. Drop sprite sheets into /public/assets (e.g. Kenney "Tiny Dungeon").
//   2. Load them with PIXI.Assets.load(...) and an AnimatedSprite per fighter.
//   3. Replace makeFighter()'s body Graphics with the loaded Sprite.
// Keep the returned { view, body, label } shape and the rest of the game is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export interface Fighter {
  view: Container;
  body: Graphics;
  label: Text;
  aura?: Graphics; // weapon-rarity glow ring (hero only)
}

const CLASS_COLOR: Record<ClassId, number> = {
  vibecoder: 0x6cf0a0,
  refactorer: 0x6cb4f0,
  architect: 0xc59cff,
};

// Rarity → glow color + strength, so a better weapon visibly upgrades the hero.
export const RARITY_TINT: Record<string, { color: number; alpha: number }> = {
  none: { color: 0x000000, alpha: 0 },
  common: { color: 0x9fbfae, alpha: 0.0 },
  uncommon: { color: 0x6cf0a0, alpha: 0.28 },
  rare: { color: 0x6cb4f0, alpha: 0.4 },
  epic: { color: 0xc59cff, alpha: 0.52 },
  legendary: { color: 0xf0b46c, alpha: 0.7 },
};

export function makeHero(cls: ClassId): Fighter {
  const view = new Container();
  const aura = new Graphics(); // behind the body
  const body = new Graphics();
  const color = CLASS_COLOR[cls] ?? 0x6cf0a0;
  body.roundRect(-26, -52, 52, 52, 8).fill(color);
  body.roundRect(-26, -52, 52, 52, 8).stroke({ color: 0xffffff, width: 2, alpha: 0.25 });
  body.circle(-9, -34, 4).fill(0x0a0e0c);
  body.circle(9, -34, 4).fill(0x0a0e0c);
  const label = makeLabel("Lv 1");
  label.y = 10;
  view.addChild(aura, body, label);
  const f: Fighter = { view, body, label, aura };
  evolveHero(f, 1, "none");
  return f;
}

/**
 * Reflect progression on the hero sprite: it grows a touch with level (capped) and
 * gains a glow ring whose color/strength track the equipped weapon's rarity. This is
 * what makes "the character changes as we go" visible without any new art.
 */
export function evolveHero(f: Fighter, level: number, weaponRarity: string): void {
  const t = RARITY_TINT[weaponRarity] ?? RARITY_TINT.none;
  if (f.aura) {
    f.aura.clear();
    if (t.alpha > 0) f.aura.roundRect(-34, -60, 68, 68, 12).fill({ color: t.color, alpha: t.alpha });
  }
  // Scale the body (not view) so juice tweens on view.scale keep working.
  const grow = 1 + Math.min(0.28, Math.max(0, level - 1) * 0.012);
  f.body.scale.set(grow);
  if (f.aura) f.aura.scale.set(grow);
  f.label.text = `Lv ${level}`;
}

export function makeMob(isBoss: boolean): Fighter {
  const view = new Container();
  const body = new Graphics();
  const color = isBoss ? 0xff5d6c : 0xe0824a;
  const s = isBoss ? 34 : 24;
  body.roundRect(-s, -s * 2, s * 2, s * 2, 8).fill(color);
  body.roundRect(-s, -s * 2, s * 2, s * 2, 8).stroke({ color: 0x000000, width: 2, alpha: 0.3 });
  body.poly([-s * 0.6, -s * 1.4, -s * 0.2, -s * 0.9, -s, -s * 0.9]).fill(0x0a0e0c);
  body.poly([s * 0.6, -s * 1.4, s * 0.2, -s * 0.9, s, -s * 0.9]).fill(0x0a0e0c);
  const label = makeLabel(isBoss ? "BOSS" : "mob");
  label.y = 10;
  view.addChild(body, label);
  return { view, body, label };
}

export function makeLabel(text: string): Text {
  const t = new Text({
    text,
    style: { fill: 0x9fbfae, fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: "600" },
  });
  t.anchor.set(0.5);
  return t;
}

export interface Bar {
  view: Container;
  set(pct: number): void;
}

export function makeBar(width: number, color: number): Bar {
  const view = new Container();
  const h = 8;
  const bg = new Graphics().roundRect(0, 0, width, h, 4).fill({ color: 0x000000, alpha: 0.5 });
  const fill = new Graphics();
  view.addChild(bg, fill);
  const draw = (pct: number) => {
    const w = Math.max(0, Math.min(1, pct)) * (width - 2);
    fill.clear();
    if (w > 0) fill.roundRect(1, 1, w, h - 2, 3).fill(color);
  };
  draw(1);
  return { view, set: draw };
}
