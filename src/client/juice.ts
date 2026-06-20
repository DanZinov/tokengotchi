import gsap from "gsap";
import { Container, Graphics, Text } from "pixi.js";
import { formatNum } from "../engine/format.js";

// Every effect here is code-driven — this is where ~80% of "game feel" comes from,
// with no extra art required. Mirrors the PRD §8.1 checklist.

/** A projectile that flies from a point to a target, then triggers `onHit`. */
export function projectile(layer: Container, fromX: number, fromY: number, toX: number, toY: number, color: number, onHit?: () => void): void {
  const p = new Graphics().circle(0, 0, 4).fill(color);
  p.x = fromX;
  p.y = fromY;
  layer.addChild(p);
  gsap.to(p, {
    x: toX,
    y: toY,
    duration: 0.16,
    ease: "power1.in",
    onComplete: () => {
      p.destroy();
      onHit?.();
    },
  });
}

/** A bright beam that snaps between two points and fades. */
export function beam(layer: Container, fromX: number, fromY: number, toX: number, toY: number, color: number): void {
  const g = new Graphics();
  g.moveTo(fromX, fromY).lineTo(toX, toY).stroke({ color, width: 5, alpha: 0.9 });
  layer.addChild(g);
  gsap.to(g, { alpha: 0, duration: 0.22, ease: "power2.out", onComplete: () => g.destroy() });
}

/** White-overlay flash sized to the body (works on any color, unlike tint). */
export function hitFlash(view: Container, body: Container): void {
  const b = body.getLocalBounds();
  const flash = new Graphics().roundRect(b.x, b.y, b.width, b.height, 8).fill(0xffffff);
  flash.alpha = 0.85;
  view.addChild(flash);
  gsap.to(flash, { alpha: 0, duration: 0.18, ease: "power2.out", onComplete: () => flash.destroy() });
}

/** Quick scale-up then settle. */
export function scalePunch(view: Container, amount = 0.18): void {
  gsap.killTweensOf(view.scale);
  gsap.fromTo(view.scale, { x: 1 + amount, y: 1 + amount }, { x: 1, y: 1, duration: 0.25, ease: "back.out(3)" });
}

/** Lunge in `dir` (+1 right / -1 left) and snap back. */
export function knockback(view: Container, dir: 1 | -1, dist = 16): void {
  const base = (view as any)._baseX ?? view.x;
  (view as any)._baseX = base;
  gsap.killTweensOf(view, "x");
  gsap.fromTo(view, { x: base + dir * dist }, { x: base, duration: 0.3, ease: "power3.out" });
}

/** Floating damage number; bigger + magenta on crit. */
export function floatingNumber(layer: Container, x: number, y: number, value: number, crit: boolean): void {
  const t = new Text({
    text: crit ? `${formatNum(value)}!` : formatNum(value),
    style: {
      fill: crit ? 0xff5d9e : 0xffffff,
      fontFamily: "ui-monospace, monospace",
      fontWeight: crit ? "800" : "600",
      fontSize: crit ? 26 : 18,
    },
  });
  t.anchor.set(0.5);
  t.x = x + (Math.random() * 16 - 8);
  t.y = y;
  layer.addChild(t);
  gsap.to(t, { y: y - 42, duration: 0.7, ease: "power1.out" });
  gsap.to(t, { alpha: 0, duration: 0.7, ease: "power1.in", onComplete: () => t.destroy() });
}

/** Burst of small particles outward from a point. */
export function particleBurst(layer: Container, x: number, y: number, color: number, n = 10): void {
  for (let i = 0; i < n; i++) {
    const p = new Graphics().circle(0, 0, 2 + Math.random() * 2).fill(color);
    p.x = x;
    p.y = y;
    layer.addChild(p);
    const ang = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 40;
    gsap.to(p, {
      x: x + Math.cos(ang) * dist,
      y: y + Math.sin(ang) * dist,
      alpha: 0,
      duration: 0.5 + Math.random() * 0.3,
      ease: "power2.out",
      onComplete: () => p.destroy(),
    });
  }
}

/** Screen shake by jittering a container, then resetting. */
export function screenShake(world: Container, intensity = 8): void {
  const baseX = (world as any)._shakeBaseX ?? world.x;
  const baseY = (world as any)._shakeBaseY ?? world.y;
  (world as any)._shakeBaseX = baseX;
  (world as any)._shakeBaseY = baseY;
  gsap.killTweensOf(world, "x,y");
  const tl = gsap.timeline({ onComplete: () => gsap.set(world, { x: baseX, y: baseY }) });
  for (let i = 0; i < 5; i++) {
    tl.to(world, {
      x: baseX + (Math.random() * 2 - 1) * intensity,
      y: baseY + (Math.random() * 2 - 1) * intensity,
      duration: 0.04,
    });
  }
  tl.to(world, { x: baseX, y: baseY, duration: 0.05 });
}
