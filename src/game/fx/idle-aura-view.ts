import type Phaser from 'phaser';
import { arcadePlayfield, type RenderCharacter, type RenderView } from '@core/index';
import { idleLookOf } from '../platform/idle-look';
import { arcadeHeroScale, visualBox, type Box } from '../views/hero-scale';
import { AURAS } from './ability-aura';
import {
  IDLE_FRAMES, LINES, LINE_STRIDE, LineKind, MAX_PARTS_TOTAL, PARTS, StrikeBudget, idleLines, idleParts, makeCtx, strikeAge,
  type IdleCtx, type IdleTier,
} from './idle-aura';
import { ELEMENT_COLORS } from './element-colors';
import { hash01, mute } from './grim-fx';
import { tri } from '../views/pose-anim';
import { STATUS_LOOKS } from './status-fx';
import { WALL_Y } from './terrain-stage-layout';

/**
 * Phaser side of the idle element auras (see idle-aura.ts and idle-look.ts; idea idle-element-auras). A lazy chunk the Arena
 * mounts in every mode. Per frame, on `postupdate`: for each active hero the pure `idleParts` / `idleLines` fill preallocated
 * buffers; the parts are drawn by pooled Images from one runtime-painted, grain-textured white atlas (tinted per part) and the
 * line shapes by two shared Graphics. A back layer sits under the hero (and under every status view), a front layer over it
 * but under every ability, status and own-element effect. The clock is the fractional view tick (`view.tick + alpha`), so a
 * paused or hit-stopped match holds still and `&manual=1` stepping is repeatable. Presentation only: nothing here reads
 * `Math.random` or touches the sim. Removed with the scene.
 */
export const IDLE_BACK_DEPTH = -0.27;
export const IDLE_FRONT_DEPTH = 0.4;
const ATLAS_KEY = 'idle-fx';
const CELL = 32;
const COLS = 5;
const ADD = 1; // Phaser.BlendModes.ADD
const BENCHED_OR_DEAD = 16 | 32;
const RAMP_TICKS = 16; // tag-in fade, 320 ms
const STRIKE_LOG_MAX = 64;
/** The pure parts are sized for a faint accent; at the real 160 px hero they need a lift to read (size x2.8, alpha x3.2). */
const SIZE_BOOST = 3.8;
const ALPHA_BOOST = 5;
/** Line shapes (licks, arcs, cracks, sheen) get the same lift: alpha x2.4 and a thicker stroke. */
const LINE_BOOST = 2.4;
/**
 * Per-hero luminous halo (a soft additive glow of the element's light behind the body): the one thing that must read at phone
 * scale. Width/height as box multiples, peak alpha, and a bright element light (not the muted particle tint).
 */
const HALO_W = 2.1;
const HALO_H = 1.6;
const HALO_ALPHA = 0.9;
const HALO_COLOR: Readonly<Record<string, number>> = { fire: 0xff8a2c, air: 0xa8d0ff, earth: 0xe0b050, water: 0x3f8cff, void: 0x9a6bff };
const MAX_HALOS = 4;
/** Per-tick movement (px) under which a hero counts as standing (pose-math STAND_SPEED 20 px/s at 50 Hz). */
const STAND_STEP = 0.4;
/** Parts drawn flatter than tall (ground shapes). */
const FLAT: Readonly<Record<string, number>> = { puddle: 0.3, ripple: 0.3, kick: 0.5, dust: 0.5 };
const COLOR_OF = [mute(ELEMENT_COLORS.fire), mute(ELEMENT_COLORS.air), 0xb8862e, mute(ELEMENT_COLORS.water), mute(ELEMENT_COLORS.air)];

export interface IdleAuraProbe {
  /** One entry per hero drawn on the last frame. */
  readonly heroes: readonly {
    id: number; sprite: string; element: string; signature: string;
    parts: number; front: number; back: number; segs: number;
    /** 1, or 0.4 while a status or ability aura rides the hero. */
    dim: number; stand: number; age: number;
  }[];
  readonly parts: number;
  readonly front: number;
  readonly back: number;
  readonly segs: number;
  /** Air strikes granted since the scene mounted (the last 64): hero id and view tick of the first strike tick. */
  readonly strikes: readonly { id: number; tick: number }[];
  readonly reduced: boolean;
  readonly highContrast: boolean;
  readonly tier: IdleTier;
  /** The upper bound on parts per hero this tier allows. */
  readonly cap: number;
}

const states = new WeakMap<Phaser.Scene, () => IdleAuraProbe>();
const hiders = new WeakMap<Phaser.Scene, (on: boolean) => void>();

/** Test control: hides every idle aura drawable (for before/after pixel comparison). */
export function idleAuraHide(arena: Phaser.Scene, on: boolean): void {
  hiders.get(arena)?.(on);
}

/** What was drawn on the last frame (test probe), or undefined before the view mounts or after teardown. */
export function idleAuraState(arena: Phaser.Scene): IdleAuraProbe | undefined {
  return states.get(arena)?.();
}

type Ctx2D = NonNullable<ReturnType<Phaser.Textures.CanvasTexture['getContext']>>;

/** Soft white blob: `core` 0..1 sets how long the centre stays solid. */
function blob(g: Ctx2D, x: number, y: number, r: number, core: number, a: number): void {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `rgba(255,255,255,${String(a)})`);
  grd.addColorStop(core, `rgba(255,255,255,${String(a * 0.6)})`);
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}
function poly(g: Ctx2D, ox: number, oy: number, pts: readonly number[], a = 1): void {
  g.fillStyle = `rgba(255,255,255,${String(a)})`;
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const x = ox + (pts[i] ?? 0);
    const y = oy + (pts[i + 1] ?? 0);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
}
function star(g: Ctx2D, cx: number, cy: number, r: number, thin: number): void {
  poly(g, cx, cy, [0, -r, thin, -thin, r, 0, thin, thin, 0, r, -thin, thin, -r, 0, -thin, -thin]);
  blob(g, cx, cy, r * 0.5, 0.3, 0.5);
}

/** Paints one atlas cell centred at (cx, cy) in white; the part tint colours it. Shapes are angular or soft per element, never outlined. */
function paintCell(g: Ctx2D, name: string, cx: number, cy: number): void {
  const h = CELL / 2;
  switch (name) {
    case 'ember': blob(g, cx, cy, h * 0.7, 0.3, 1); break;
    case 'ash': poly(g, cx, cy, [-7, -2, -2, -8, 6, -5, 8, 3, 1, 7, -6, 5], 0.85); break;
    case 'smoke': blob(g, cx, cy, h - 1, 0.1, 0.8); blob(g, cx + 4, cy - 3, h * 0.55, 0.2, 0.5); break;
    case 'haze': blob(g, cx, cy, h - 1, 0, 0.55); break;
    case 'kick': blob(g, cx, cy, h - 1, 0.2, 0.7); break;
    case 'dust': blob(g, cx, cy, h - 1, 0.3, 0.8); break;
    case 'mist': blob(g, cx, cy, h - 1, 0.15, 0.7); break;
    case 'spark': star(g, cx, cy, 10, 1.6); break;
    case 'glint': star(g, cx, cy, 13, 1.8); break;
    case 'grit': poly(g, cx, cy, [-4, -3, 3, -4, 4, 3, -3, 4]); break;
    case 'pebble': poly(g, cx, cy, [-8, 1, -4, -6, 4, -7, 9, 0, 5, 6, -4, 7]); poly(g, cx, cy, [-3, -4, 4, -5, 6, 0, -2, 1], 0.5); break;
    case 'leaf':
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath(); g.moveTo(cx - 9, cy + 3); g.quadraticCurveTo(cx - 2, cy - 11, cx + 10, cy - 3); g.quadraticCurveTo(cx + 2, cy + 9, cx - 9, cy + 3); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 8, cy + 3); g.lineTo(cx + 8, cy - 3); g.stroke();
      break;
    case 'drop': poly(g, cx, cy, [0, -11, 5, 1, 0, 3, -5, 1]); g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(cx, cy + 3, 5, 0, 6.2832); g.fill(); break;
    case 'halo': blob(g, cx, cy, h - 1, 0.25, 1); break;
    case 'puddle': blob(g, cx, cy, h - 1, 0.5, 0.65); break;
    case 'ripple':
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, h - 4, 0, 6.2832); g.stroke();
      break;
    case 'bubble':
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 8, 0, 6.2832); g.stroke();
      blob(g, cx - 3, cy - 3, 3, 0.2, 0.8);
      break;
    case 'diamond': poly(g, cx, cy, [0, -9, 6, 0, 0, 9, -6, 0]); poly(g, cx, cy, [0, -9, 6, 0, 0, 0], 0.4); break;
    default: blob(g, cx, cy, h - 2, 0.4, 0.8);
  }
}

/** Paints the shared atlas once: white cells with a little deterministic grain, so nothing reads as a flat vector blob. */
function ensureAtlas(scene: Phaser.Scene): boolean {
  if (scene.textures.exists(ATLAS_KEY)) return true;
  const NAMES = [...IDLE_FRAMES, 'halo'];
  const rows = Math.ceil(NAMES.length / COLS);
  const tex = scene.textures.createCanvas(ATLAS_KEY, COLS * CELL, rows * CELL);
  const g = tex?.getContext();
  if (!tex || !g) return false;
  NAMES.forEach((name, i) => {
    paintCell(g, name, (i % COLS) * CELL + CELL / 2, Math.floor(i / COLS) * CELL + CELL / 2);
  });
  const img = g.getImageData(0, 0, COLS * CELL, rows * CELL);
  const px = img.data;
  for (let i = 0; i + 3 < px.length; i += 4) {
    const a = px[i + 3] ?? 0;
    if (a === 0) continue;
    const n = hash01(i >> 2, 21);
    px[i + 3] = Math.round(a * (0.72 + 0.28 * n));
    const l = Math.round(205 + 50 * hash01(i >> 2, 22));
    px[i] = Math.min(px[i] ?? 0, l);
    px[i + 1] = Math.min(px[i + 1] ?? 0, l);
    px[i + 2] = Math.min(px[i + 2] ?? 0, l);
  }
  g.putImageData(img, 0, 0);
  NAMES.forEach((name, i) => {
    tex.add(name, 0, (i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL);
  });
  tex.refresh();
  return true;
}

interface Slot {
  born: number;
  stand: number;
  face: number;
  /** Strike state: view tick the current strike granted/refused at, and whether it is on. */
  strikeOn: boolean;
  strikeSeen: number;
  seen: number;
  salt: number;
  sprite: string;
}

const KIND_FRONT = [true, true, false, false, false]; // lick, arc in front; crack, sheen, sonar behind

export function mountIdleAuraView(
  arena: Phaser.Scene,
  view: RenderView,
  alpha: () => number,
  reduceMotion: () => boolean,
  highContrast: () => boolean,
  pos: () => number = alpha,
): void {
  let backG: Phaser.GameObjects.Graphics | undefined;
  let frontG: Phaser.GameObjects.Graphics | undefined;
  const imgs: Phaser.GameObjects.Image[] = [];
  const slots = new Map<number, Slot>();
  const budget = new StrikeBudget();
  const strikes: { id: number; tick: number }[] = [];
  const ctx: IdleCtx = makeCtx();
  const box: Box = { x: 0, y: 0, w: 0, h: 0 };
  let heroes: { id: number; sprite: string; element: string; signature: string; parts: number; front: number; back: number; segs: number; dim: number; stand: number; age: number }[] = [];
  const tier: IdleTier = 'full';
  let lastRound = -1;
  let lastTick = -1;
  let total = { parts: 0, front: 0, back: 0, segs: 0 };
  let reducedNow = false;
  const halos: Phaser.GameObjects.Image[] = [];
  const shades: Phaser.GameObjects.Image[] = [];
  let nHalo = 0;
  let hidden = false;
  let contrastNow = false;
  let ownIds: readonly { id: number }[] = [];
  let ownState: ((a: Phaser.Scene) => { active: readonly { id: number }[] } | undefined) | undefined;
  if (view.arcade()) {
    void import('./own-element-view').then((m) => {
      ownState = m.ownElementState;
    });
  }

  // Per-frame scratch read by the pre-bound visitors (no closures in the loop).
  let frameTick = 0;
  let fracTick = 0;
  let nPart = 0;
  let nSeg = 0;
  let statusCount = 0;
  const haloData = new Float32Array(MAX_HALOS * 5); // x, y, w, h, alpha
  const haloColor: number[] = [0, 0, 0, 0];
  const onStatus = (st: { id: number }): void => {
    if (STATUS_LOOKS[st.id] || AURAS.some((a) => a.status === st.id)) statusCount++;
  };

  const visit = (c: RenderCharacter): void => {
    if ((c.flags & BENCHED_OR_DEAD) !== 0) return;
    const look = idleLookOf(c.sprite, c.element);
    if (look.element === 'none' || look.amount <= 0) return;
    let s = slots.get(c.id);
    if (!s) {
      s = { born: frameTick, stand: 1, face: 1, strikeOn: false, strikeSeen: -1, seen: frameTick, salt: 0, sprite: c.sprite };
      slots.set(c.id, s);
    }
    if (s.sprite !== c.sprite) {
      s.sprite = c.sprite;
      s.born = frameTick;
    }
    s.seen = frameTick;
    let h = 7;
    for (let i = 0; i < c.sprite.length; i++) h = (Math.imul(h, 31) + c.sprite.charCodeAt(i)) | 0;
    s.salt = c.id * 977 + (h & 0xfff);
    if (c.dir === 0) s.face = 1;
    else if (c.dir === 4) s.face = -1;
    const p = pos();
    const x = c.px + (c.x - c.px) * p;
    const y = c.py + (c.y - c.py) * p;
    const moved = Math.abs(c.x - c.px) + Math.abs(c.y - c.py);
    s.stand += ((moved < STAND_STEP ? 1 : 0) - s.stand) * 0.12;
    visualBox(x, y, c.w, c.h, view.arcade() ? arcadeHeroScale(c.h) : 1, box, view.arcade() ? arcadePlayfield().w : undefined);

    statusCount = 0;
    view.forEachStatus(c.id, onStatus);
    const statusHit = statusCount > 0;
    const ramp = Math.min(1, (fracTick - s.born) / RAMP_TICKS);
    ctx.age = Math.max(0, fracTick - s.born);
    ctx.stand = s.stand;
    ctx.reduced = reducedNow;
    ctx.tier = tier;
    ctx.salt = s.salt;
    ctx.face = s.face;
    ctx.noGround = ownIds.some((o) => o.id === c.id);
    ctx.highContrast = contrastNow;
    ctx.dim = (statusHit ? 0.4 : 1) * ramp;
    ctx.wallY = WALL_Y;
    // Air strikes: asked once per scheduled strike; a refused strike simply does not happen. None in reduced motion.
    ctx.strike = -1;
    if (look.element === 'air' && !reducedNow) {
      const age = strikeAge(s.salt, frameTick);
      // Decide once per scheduled strike, on the first frame that sees it (a frame can skip its first tick).
      const startTick = frameTick - age;
      if (age >= 0 && s.strikeSeen !== startTick) {
        s.strikeSeen = startTick;
        s.strikeOn = budget.allow(c.id, frameTick);
        if (s.strikeOn) {
          strikes.push({ id: c.id, tick: frameTick });
          if (strikes.length > STRIKE_LOG_MAX) strikes.shift();
        }
      }
      if (age < 0) s.strikeOn = false;
      else if (s.strikeOn) ctx.strike = age;
    }
    if (nHalo < MAX_HALOS) {
      const o = nHalo * 5;
      const pulse = reducedNow ? 0.85 : 0.8 + 0.2 * tri(fracTick / 70 + hash01(0, s.salt));
      haloData[o] = box.x + box.w / 2;
      haloData[o + 1] = box.y + box.h * 0.55;
      haloData[o + 2] = box.w * HALO_W;
      haloData[o + 3] = box.h * HALO_H;
      haloData[o + 4] = HALO_ALPHA * pulse * look.amount * ctx.dim * (contrastNow ? 0.5 : 1);
      haloColor[nHalo] = HALO_COLOR[look.element] ?? 0xffffff;
      nHalo++;
    }
    const p0 = nPart;
    nPart += idleParts(look, box, ctx, PARTS, nPart);
    const l0 = nSeg;
    nSeg += idleLines(look, box, ctx, LINES, nSeg);
    let front = 0;
    let back = 0;
    for (let i = p0; i < nPart; i++) {
      const p = PARTS[i];
      if (!p) continue;
      // A status or ability aura on the hero takes the front layer.
      if (statusHit && p.front) p.front = false;
      if (p.front) front++;
      else back++;
    }
    heroes.push({ id: c.id, sprite: c.sprite, element: look.element, signature: look.signature, parts: nPart - p0, front, back, segs: nSeg - l0, dim: statusHit ? 0.4 : 1, stand: Math.round(s.stand * 100) / 100, age: Math.round(ctx.age * 10) / 10 });
  };

  const drawLines = (): void => {
    const back = (backG ??= arena.add.graphics().setDepth(IDLE_BACK_DEPTH));
    const front = (frontG ??= arena.add.graphics().setDepth(IDLE_FRONT_DEPTH));
    back.clear();
    front.clear();
    for (let n = 0; n < nSeg; n++) {
      const o = n * LINE_STRIDE;
      const kind = LINES[o + 5] ?? 0;
      const a = Math.min(1, (LINES[o + 4] ?? 0) * (contrastNow ? 1.6 : LINE_BOOST));
      if (a <= 0.01) continue;
      const g = KIND_FRONT[kind] ? front : back;
      const x1 = LINES[o] ?? 0;
      const y1 = LINES[o + 1] ?? 0;
      const x2 = LINES[o + 2] ?? 0;
      const y2 = LINES[o + 3] ?? 0;
      const col = kind === LineKind.crack ? COLOR_OF[2] ?? 0 : COLOR_OF[kind === LineKind.lick ? 0 : kind === LineKind.sheen ? 3 : 1] ?? 0;
      if (contrastNow) g.lineStyle(4, 0x000000, 0.5 * a).lineBetween(x1, y1, x2, y2);
      else g.lineStyle(kind === LineKind.sheen ? 12 : 9, col, a * 0.3).lineBetween(x1, y1, x2, y2);
      g.lineStyle(kind === LineKind.sheen ? 5 : 3, col, Math.min(0.95, a)).lineBetween(x1, y1, x2, y2);
    }
  };

  const draw = (): void => {
    reducedNow = reduceMotion();
    contrastNow = highContrast();
    frameTick = view.tick;
    fracTick = frameTick + alpha();
    if (frameTick < lastTick) {
      budget.clear();
      strikes.length = 0;
    }
    lastTick = frameTick;
    const round = view.arcade()?.round ?? 0;
    if (round !== lastRound) {
      // A new round starts clean: per-hero state (age, stand) restarts with the heroes.
      if (lastRound !== -1) slots.clear();
      lastRound = round;
    }
    ownIds = ownState?.(arena)?.active ?? ownIds;
    if (!ensureAtlas(arena)) return;
    nPart = 0;
    nSeg = 0;
    nHalo = 0;
    heroes = [];
    view.forEachCharacter(visit);
    for (const [id, s] of slots) if (s.seen !== frameTick) slots.delete(id);
    drawLines();
    for (let i = 0; i < MAX_HALOS; i++) {
      let im = halos[i];
      if (i >= nHalo || hidden) {
        im?.setVisible(false);
      shades[i]?.setVisible(false);
        continue;
      }
      im ??= halos[i] = arena.add.image(0, 0, ATLAS_KEY, 'halo').setBlendMode(ADD).setDepth(IDLE_BACK_DEPTH - 0.01);
      // A dark pool under the light, so the glow reads on warm and bright floors too (light on light vanishes).
      const sh = (shades[i] ??= arena.add.image(0, 0, ATLAS_KEY, 'halo').setTint(0x000000).setDepth(IDLE_BACK_DEPTH - 0.02));
      const o = i * 5;
      sh.setVisible(true).setPosition(haloData[o] ?? 0, (haloData[o + 1] ?? 0) + 4).setScale((haloData[o + 2] ?? 0) * 1.1 / CELL, (haloData[o + 3] ?? 0) * 1.1 / CELL)
        .setAlpha(Math.min(0.6, (haloData[o + 4] ?? 0) * 0.55));
      im.setVisible(true).setPosition(haloData[o] ?? 0, haloData[o + 1] ?? 0).setScale((haloData[o + 2] ?? 0) / CELL, (haloData[o + 3] ?? 0) / CELL)
        .setAlpha(haloData[o + 4] ?? 0).setTint(haloColor[i] ?? 0xffffff);
    }

    // Four passes keep the batches few: back normal, back additive, front normal, front additive.
    let used = 0;
    let front = 0;
    let back = 0;
    for (let pass = 0; pass < 4; pass++) {
      const wantFront = pass >= 2;
      const wantAdd = pass % 2 === 1;
      for (let i = 0; i < nPart && used < MAX_PARTS_TOTAL; i++) {
        const p = PARTS[i];
        if (!p || p.front !== wantFront || p.add !== wantAdd || p.alpha <= 0.01) continue;
        let im = imgs[used];
        if (!im) {
          im = arena.add.image(0, 0, ATLAS_KEY, p.frame);
          imgs.push(im);
        }
        if (im.frame.name !== p.frame) im.setFrame(p.frame);
        const sc = (p.size * SIZE_BOOST) / CELL;
        im.setVisible(true).setPosition(p.x, p.y).setScale(sc, sc * (FLAT[p.frame] ?? 1)).setRotation(p.rot).setAlpha(Math.min(1, p.alpha * ALPHA_BOOST)).setTint(p.color)
          .setBlendMode(wantAdd ? ADD : 0).setDepth(wantFront ? IDLE_FRONT_DEPTH : IDLE_BACK_DEPTH);
        used++;
        if (wantFront) front++;
        else back++;
      }
    }
    for (let i = used; i < imgs.length; i++) imgs[i]?.setVisible(false);
    if (hidden) for (const im of imgs) im.setVisible(false);
    if (hidden) { backG?.clear(); frontG?.clear(); }
    total = { parts: used, front, back, segs: nSeg };
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    hiders.delete(arena);
    backG?.destroy();
    frontG?.destroy();
    backG = undefined;
    frontG = undefined;
    for (const im of imgs) im.destroy();
    for (const im of halos) im.destroy();
    for (const im of shades) im.destroy();
    halos.length = 0;
    shades.length = 0;
    imgs.length = 0;
    slots.clear();
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  hiders.set(arena, (on) => { hidden = on; });
  states.set(arena, () => ({
    heroes, ...total, strikes: strikes.slice(), reduced: reducedNow, highContrast: contrastNow, tier, cap: 18,
  }));
}
