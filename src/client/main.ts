import { Application, Container } from "pixi.js";
import { CONFIG, CLASSES } from "../engine/constants.js";
import { canPrestige, prestigeGain } from "../engine/prestige.js";
import type { ClassId, CombatEvent, GameState, Item, Slot } from "../engine/types.js";
import { makeHero, makeMob, makeBar, evolveHero, type Bar, type Fighter } from "./sprites.js";
import { floatingNumber, hitFlash, knockback, particleBurst, scalePunch, screenShake } from "./juice.js";
import { DONATE_LINKS } from "./donate.config.js";

type Msg =
  | { kind: "state"; state: GameState }
  | { kind: "tick"; events: CombatEvent[]; summary: unknown; tokens: number; energyGained: number }
  | { kind: "notice"; text: string; tone?: "good" | "bad" };

const RARITY_COLOR: Record<string, string> = {
  common: "#9fbfae",
  uncommon: "#6cf0a0",
  rare: "#6cb4f0",
  epic: "#c59cff",
  legendary: "#f0b46c",
};

// Short, on-brand class tags shown under each class button.
const CLASS_TAG: Record<ClassId, string> = {
  vibecoder: "crit / glass",
  refactorer: "tank / sustain",
  architect: "balanced",
};

const $ = (id: string) => document.getElementById(id)!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fmtTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
}

/** Compact "+12 atk, +0.02 crit" summary of an item's mods. */
function modSummary(item: Item): string {
  const order: (keyof Item["mods"])[] = ["atk", "def", "hp", "crit"];
  const parts: string[] = [];
  for (const k of order) {
    const v = item.mods[k];
    if (v == null) continue;
    parts.push(k === "crit" ? `+${(v * 100).toFixed(0)}% crit` : `+${v} ${k}`);
  }
  return parts.slice(0, 2).join(", ");
}

async function boot() {
  const stage = $("stage");
  const app = new Application();
  await app.init({ background: "#0a0e0c", resizeTo: stage, antialias: true });
  stage.appendChild(app.canvas);

  // Virtual arena: lay the fight out in a fixed 520×360 space, then scale + center the
  // whole `world` to fit whatever size the stage is. This keeps the fighters readable
  // and non-overlapping from a tiny side-strip window up to a full screen.
  const VW = 520;
  const VH = 360;

  const world = new Container();
  const fx = new Container();
  app.stage.addChild(world);

  let hero: Fighter = makeHero("architect");
  let heroBar: Bar = makeBar(110, 0x6cf0a0);
  let mob: Fighter = makeMob(false);
  let mobBar: Bar = makeBar(110, 0xff5d6c);
  // fx lives inside `world` so damage numbers / particles scale + shake with the arena.
  world.addChild(hero.view, heroBar.view, mob.view, mobBar.view, fx);

  let lastFloor = 1;
  let lastClass: ClassId = "architect";

  function layout() {
    const w = app.screen.width;
    const h = app.screen.height;
    // Fit the virtual arena into the stage (clamp so it never gets absurd either way).
    const scale = Math.max(0.3, Math.min(1.5, Math.min(w / VW, h / VH)));
    world.scale.set(scale);
    world.x = (w - VW * scale) / 2;
    world.y = (h - VH * scale) / 2;
    (world as any)._shakeBaseX = world.x;
    (world as any)._shakeBaseY = world.y;

    const cy = VH * 0.6;
    hero.view.x = VW * 0.3;
    hero.view.y = cy;
    (hero.view as any)._baseX = hero.view.x;
    heroBar.view.x = hero.view.x - 55;
    heroBar.view.y = cy - 92;
    mob.view.x = VW * 0.7;
    mob.view.y = cy;
    (mob.view as any)._baseX = mob.view.x;
    mobBar.view.x = mob.view.x - 55;
    mobBar.view.y = cy - 92;
  }
  layout();
  app.renderer.on("resize", layout);

  function respawnMob(floor: number) {
    const isBoss = floor % CONFIG.BOSS_INTERVAL === 0;
    world.removeChild(mob.view);
    mob = makeMob(isBoss);
    world.addChildAt(mob.view, world.getChildIndex(mobBar.view));
    mobBar.set(1);
    layout();
  }

  function rebuildHero(cls: ClassId) {
    world.removeChild(hero.view);
    hero = makeHero(cls);
    world.addChildAt(hero.view, 0);
    heroBar.set(1);
    layout();
  }

  // ── HUD + sidebar ──────────────────────────────────────────────────────────
  function setHud(s: GameState) {
    $("floor").textContent = String(s.progress.floor);
    $("level").textContent = String(s.hero.level);
    $("streak").textContent = `${s.daily.streakDays}d`;
    $("tokens").textContent = fmtTokens(s.usage.lifetimeTokens);
    $("energy").textContent = s.hero.energy.toFixed(1);
  }

  function updateClassPickerActive(current: ClassId) {
    $("class-name").textContent = CLASSES[current].name;
    document.querySelectorAll<HTMLElement>(".class-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.cls === current);
    });
  }

  function setSlot(slot: Slot, item: Item | null) {
    const el = $(`slot-${slot}`);
    const icon = el.querySelector<HTMLElement>(".icon")!;
    const name = el.querySelector<HTMLElement>(".sname")!;
    const smod = el.querySelector<HTMLElement>(".smod")!;
    if (!item) {
      el.classList.add("empty");
      icon.style.background = "var(--dim)";
      name.style.color = "";
      name.textContent = `${slot} —`;
      smod.textContent = "";
      return;
    }
    el.classList.remove("empty");
    const color = RARITY_COLOR[item.rarity] ?? "#9fbfae";
    icon.style.background = color;
    name.style.color = color;
    name.textContent = item.name;
    smod.textContent = modSummary(item);
  }

  function updateLoadout(s: GameState) {
    setSlot("weapon", s.gear.weapon);
    setSlot("armor", s.gear.armor);
    setSlot("trinket", s.gear.trinket);
    $("inv-note").textContent = `stash: ${s.inventory.length} item${s.inventory.length === 1 ? "" : "s"}`;
  }

  function updatePrestige(s: GameState) {
    const btn = $("prestige-btn") as HTMLButtonElement;
    const sub = $("prestige-sub");
    const can = canPrestige(s);
    btn.disabled = !can;
    btn.textContent = can ? `PRESTIGE  +×${prestigeGain(s).toFixed(2)}` : "PRESTIGE";
    sub.textContent = can
      ? `Reset to floor 1 for a permanent +×${prestigeGain(s).toFixed(2)} to damage, gold & xp.`
      : `Reach floor ${CONFIG.PRESTIGE_MIN_FLOOR} (the first boss) to reset for a permanent multiplier.`;
    const stat = $("prestige-stat");
    if (s.prestige.count > 0) {
      stat.style.display = "flex";
      $("prestige").textContent = `×${s.prestige.multiplier.toFixed(2)} · ${s.prestige.count}`;
    } else {
      stat.style.display = "none";
    }
  }

  function applyState(s: GameState) {
    setHud(s);
    updateClassPickerActive(s.hero.class);
    updateLoadout(s);
    updatePrestige(s);
    if (s.hero.class !== lastClass) {
      rebuildHero(s.hero.class);
      lastClass = s.hero.class;
    }
    evolveHero(hero, s.hero.level, s.gear.weapon?.rarity ?? "none");
  }

  function log(line: string, color = "#9fbfae") {
    const el = document.createElement("div");
    el.className = "logline";
    el.style.color = color;
    el.textContent = line;
    const box = $("log");
    box.appendChild(el);
    while (box.childElementCount > 81) box.children[1]?.remove(); // keep the // header
    box.scrollTop = box.scrollHeight;
  }

  function toast(text: string, color: string) {
    const t = $("toast");
    t.textContent = text;
    t.style.color = color;
    t.style.opacity = "1";
    t.style.transform = "translateY(0)";
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateY(-6px)";
    }, 1400);
  }

  // ── Static UI: class picker, prestige, donate ───────────────────────────────
  function buildClassPicker() {
    const box = $("classes");
    box.innerHTML = "";
    (Object.keys(CLASSES) as ClassId[]).forEach((id) => {
      const b = document.createElement("button");
      b.className = "class-btn";
      b.dataset.cls = id;
      b.innerHTML = `${CLASSES[id].name}<small>${CLASS_TAG[id]}</small>`;
      b.onclick = () => send({ kind: "command", cmd: "setClass", class: id });
      box.appendChild(b);
    });
  }

  function buildDonate() {
    const box = $("donate-links");
    box.innerHTML = "";
    if (DONATE_LINKS.length === 0) {
      const d = document.createElement("div");
      d.className = "donate-empty";
      d.textContent =
        "No links yet. Add your GitHub Sponsors / Ko-fi / Buy Me a Coffee handle in src/client/donate.config.ts and they'll show up here.";
      box.appendChild(d);
      return;
    }
    for (const l of DONATE_LINKS) {
      const a = document.createElement("a");
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = l.label;
      box.appendChild(a);
    }
  }

  buildClassPicker();
  buildDonate();
  ($("prestige-btn") as HTMLButtonElement).onclick = () => send({ kind: "command", cmd: "prestige" });
  $("support").onclick = () => $("donate").classList.add("open");
  $("donate-close").onclick = () => $("donate").classList.remove("open");
  $("donate").onclick = (e) => {
    if ((e.target as HTMLElement).id === "donate") $("donate").classList.remove("open");
  };

  // ── Event replay ────────────────────────────────────────────────────────────
  const queue: CombatEvent[] = [];
  let playing = false;

  async function play() {
    if (playing) return;
    playing = true;
    while (queue.length) {
      const ev = queue.shift()!;
      await handle(ev);
    }
    playing = false;
  }

  async function handle(ev: CombatEvent) {
    switch (ev.type) {
      case "attack": {
        if (ev.who === "hero") {
          knockback(hero.view, 1, 14);
          hitFlash(mob.view, mob.body);
          scalePunch(mob.view, 0.12);
          mobBar.set(ev.targetHpAfter / ev.targetMaxHp);
          floatingNumber(fx, mob.view.x, mob.view.y - 70, ev.dmg, ev.crit);
          particleBurst(fx, mob.view.x, mob.view.y - 40, ev.crit ? 0xff5d9e : 0xffd17d, ev.crit ? 16 : 8);
          if (ev.crit) screenShake(world, 6);
        } else {
          knockback(mob.view, -1, 14);
          hitFlash(hero.view, hero.body);
          heroBar.set(ev.targetHpAfter / ev.targetMaxHp);
          floatingNumber(fx, hero.view.x, hero.view.y - 70, ev.dmg, false);
          particleBurst(fx, hero.view.x, hero.view.y - 40, 0xff8d8d, 6);
        }
        await sleep(190);
        break;
      }
      case "kill": {
        particleBurst(fx, mob.view.x, mob.view.y - 40, ev.isBoss ? 0xff5d6c : 0xe0824a, ev.isBoss ? 28 : 14);
        scalePunch(mob.view, -0.4);
        if (ev.isBoss) {
          screenShake(world, 12);
          log(`▲ cleared BOSS on floor ${ev.floor}`, "#f0b46c");
        }
        await sleep(ev.isBoss ? 280 : 120);
        break;
      }
      case "advance": {
        respawnMob(ev.floor);
        $("floor").textContent = String(ev.floor);
        lastFloor = ev.floor;
        await sleep(90);
        break;
      }
      case "drop": {
        const c = RARITY_COLOR[ev.item.rarity] ?? "#9fbfae";
        particleBurst(fx, hero.view.x, hero.view.y - 50, 0xffd17d, 10);
        log(`✦ ${ev.item.rarity} ${ev.item.name}${ev.equipped ? " (equipped)" : ""}`, c);
        toast(`${ev.item.rarity} drop: ${ev.item.name}`, c);
        await sleep(120);
        break;
      }
      case "levelup": {
        scalePunch(hero.view, 0.4);
        particleBurst(fx, hero.view.x, hero.view.y - 50, 0x6cf0a0, 18);
        log(`★ level ${ev.level}`, "#6cf0a0");
        toast(`Level ${ev.level}!`, "#6cf0a0");
        await sleep(160);
        break;
      }
      case "defeat": {
        screenShake(world, 10);
        log(`stalled on floor ${ev.floor} — need more energy`, "#ff8d8d");
        toast("Out of energy — come back after coding", "#ff8d8d");
        await sleep(200);
        break;
      }
    }
  }

  // ── Connection ──────────────────────────────────────────────────────────────
  const wsUrl = new URLSearchParams(location.search).get("ws") || `ws://${location.hostname}:7070`;
  let firstState = true;
  let socket: WebSocket | null = null;

  function send(obj: unknown) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
  }

  function connect() {
    const ws = new WebSocket(wsUrl);
    socket = ws;
    ws.onopen = () => log("connected to engine", "#6cf0a0");
    ws.onclose = () => {
      log("disconnected — retrying…", "#ff8d8d");
      setTimeout(connect, 2000);
    };
    ws.onmessage = (e) => {
      let msg: Msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.kind === "state") {
        if (firstState) {
          lastClass = msg.state.hero.class;
          rebuildHero(msg.state.hero.class);
          respawnMob(msg.state.progress.floor);
          lastFloor = msg.state.progress.floor;
          firstState = false;
          log("ready — start coding to power your hero", "#9fbfae");
        } else if (!playing && msg.state.progress.floor !== lastFloor) {
          respawnMob(msg.state.progress.floor);
          lastFloor = msg.state.progress.floor;
        }
        applyState(msg.state);
      } else if (msg.kind === "tick") {
        if (msg.tokens > 0) {
          log(`+${fmtTokens(msg.tokens)} tokens → +${msg.energyGained.toFixed(1)} energy`, "#6cf0a0");
        }
        queue.push(...msg.events);
        void play();
      } else if (msg.kind === "notice") {
        const c = msg.tone === "bad" ? "#ff8d8d" : "#6cf0a0";
        log(msg.text, c);
        toast(msg.text, c);
      }
    };
  }
  connect();
}

boot();
