import type Phaser from 'phaser';
import { EntityFlag, type RenderCharacter, type RenderProjectile, type RenderStatus, type RenderView, type SimEvent } from '@core/index';
import { arcadeHeroScale, visualBox, type Box } from '../views/hero-scale';
import {
  CC_FRAMES, CC_GYRE_COLOR, CC_LINE_STRIDE, CC_LOOKS, CC_TIER_CAPS, CcLineKind, CcTracker, MAX_CC_PARTS_TOTAL, MAX_CC_SEGS_TOTAL, ccParts,
  ccReleaseParts, makeCcOut, makeRead, releaseTicks, type CcKindOrNone, type CcRead, type CcRelease,
} from './cc-fx';
import { FlashGate } from './flash-gate';
import { hash01, mute } from './grim-fx';
import type { IdleTier } from './idle-aura';

/**
 * Phaser side of the crowd-control overlay (idea crowd-control-animations, CA4; look model in cc-fx.ts). A lazy chunk the Arena
 * mounts in every mode. Per frame, on `postupdate`, for each active hero: the read-outs (stun, root, mire, knockback, statuses)
 * go to the pure `CcTracker`, whose state drives `ccParts` / `ccReleaseParts`. Parts are pooled Images from one runtime-painted,
 * grain-textured white atlas (tinted per part); line shapes (gyre bands, strands, scuffs, cracks) and the break-out ring go to
 * two shared Graphics (a normal one and an additive one). All clocks are view ticks (`view.tick + alpha`), so a paused match
 * holds still. The break-out ring is the only flash-like cue: a `FlashGate` allows one per hero per 17 ticks. Nothing here
 * touches the sim, and the frame path allocates nothing after the first frames. Removed with the scene.
 */
export const CC_DEPTH = 6.25;
const BACK_DEPTH = CC_DEPTH - 0.01;
const FRONT_DEPTH = CC_DEPTH + 0.01;
const ATLAS_KEY = 'cc-fx';
const CELL = 32;
const COLS = 3;
const ADD = 1; // Phaser.BlendModes.ADD
const BENCHED_OR_DEAD = 16 | 32;
const SLOTS = 64;
const STATUS_FREEZE = 5;
const STATUS_SLOW = 6;
const STATUS_TIDE = 9;
/** Parts are sized for a faint accent; the real 160 px hero wants a lift. */
const SIZE_BOOST = 1.7;
const RING_TICKS = 14;
const PUFF_TICKS = 14;
const CRACK_RAYS = 6;
const GLOW_FRAMES: Readonly<Record<string, boolean>> = { mote: true };
const MUCK_UNDER = 0x1c1a14;
const STRAND_COLOR = mute(0x8a8060);
const SCUFF_COLOR = mute(0xb0a48a);
const RING_COLOR = mute(0xc8d4d0);
const PUFF_COLOR = mute(0x9a9486);
/** Crack rays: unit directions (no trig) and a length factor. */
const RAY_X = [0.9, 0.5, -0.4, -0.9, -0.5, 0.35];
const RAY_Y = [-0.3, -0.85, -0.9, 0.2, 0.85, 0.9];
const RAY_LEN = [0.9, 0.7, 0.8, 0.85, 0.65, 0.75];

export interface CcFxProbe {
  /** One entry per hero with a look on the last frame. */
  readonly heroes: readonly { id: number; kind: CcKindOrNone; release: CcRelease; parts: number; segs: number; age: number }[];
  readonly parts: number;
  readonly segs: number;
  /** Break-out rings, locked cracks and wall puffs drawn on the last frame. */
  readonly rings: number;
  readonly cracks: number;
  readonly puffs: number;
  /** Cumulative since the scene mounted: rings and cracks started, rings the FlashGate refused. */
  readonly started: { readonly ring: number; readonly crack: number; readonly puff: number; readonly denied: number };
  readonly reduced: boolean;
  readonly highContrast: boolean;
  readonly tier: IdleTier;
}

const states = new WeakMap<Phaser.Scene, () => CcFxProbe>();

/** What was drawn on the last frame (test probe), or undefined before the view mounts or after teardown. */
export function ccFxState(arena: Phaser.Scene): CcFxProbe | undefined {
  return states.get(arena)?.();
}

type Ctx2D = NonNullable<ReturnType<Phaser.Textures.CanvasTexture['getContext']>>;

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
    if (i === 0) g.moveTo(ox + (pts[i] ?? 0), oy + (pts[i + 1] ?? 0));
    else g.lineTo(ox + (pts[i] ?? 0), oy + (pts[i + 1] ?? 0));
  }
  g.closePath();
  g.fill();
}

/** One atlas cell in white, centred at (cx, cy): angular grit, soft motes and dust, lumpy muck. Never outlined. */
function paintCell(g: Ctx2D, name: string, cx: number, cy: number): void {
  const h = CELL / 2;
  switch (name) {
    case 'mote': blob(g, cx, cy, h - 2, 0.2, 0.9); blob(g, cx, cy, h * 0.3, 0.5, 1); break;
    case 'chip': poly(g, cx, cy, [-7, -3, -1, -8, 6, -4, 8, 3, 1, 8, -5, 5]); poly(g, cx, cy, [-3, -4, 4, -4, 5, 1, -2, 2], 0.45); break;
    case 'muck': blob(g, cx - 4, cy + 1, 10, 0.4, 0.9); blob(g, cx + 5, cy, 8, 0.4, 0.85); blob(g, cx, cy - 3, 7, 0.3, 0.8); break;
    case 'glob': blob(g, cx, cy + 2, 9, 0.55, 1); poly(g, cx, cy, [0, -11, 5, -2, -5, -2], 0.9); break;
    default: blob(g, cx, cy, h - 1, 0.1, 0.65); blob(g, cx + 4, cy - 3, h * 0.55, 0.2, 0.45); break;
  }
}

function ensureAtlas(scene: Phaser.Scene): boolean {
  if (scene.textures.exists(ATLAS_KEY)) return true;
  const names = [...CC_FRAMES];
  const rows = Math.ceil(names.length / COLS);
  const tex = scene.textures.createCanvas(ATLAS_KEY, COLS * CELL, rows * CELL);
  const g = tex?.getContext();
  if (!tex || !g) return false;
  names.forEach((name, i) => {
    paintCell(g, name, (i % COLS) * CELL + CELL / 2, Math.floor(i / COLS) * CELL + CELL / 2);
  });
  const img = g.getImageData(0, 0, COLS * CELL, rows * CELL);
  const px = img.data;
  for (let i = 0; i + 3 < px.length; i += 4) {
    const a = px[i + 3] ?? 0;
    if (a === 0) continue;
    px[i + 3] = Math.round(a * (0.72 + 0.28 * hash01(i >> 2, 31)));
    const l = Math.round(205 + 50 * hash01(i >> 2, 32));
    px[i] = Math.min(px[i] ?? 0, l);
    px[i + 1] = Math.min(px[i + 1] ?? 0, l);
    px[i + 2] = Math.min(px[i + 2] ?? 0, l);
  }
  g.putImageData(img, 0, 0);
  names.forEach((name, i) => {
    tex.add(name, 0, (i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL);
  });
  tex.refresh();
  return true;
}

interface Row { id: number; kind: CcKindOrNone; release: CcRelease; parts: number; segs: number; age: number }

/**
 * Mounts the overlay. Returns the event feed: the Arena calls it with each step's events (latches and release reasons).
 * `alpha` is the render interpolation fraction.
 */
export function mountCcView(
  arena: Phaser.Scene,
  view: RenderView,
  alpha: () => number,
  reduceMotion: () => boolean,
  highContrast: () => boolean,
): (events: readonly SimEvent[]) => void {
  const tracker = new CcTracker(SLOTS);
  const gate = new FlashGate();
  const out = makeCcOut(CC_TIER_CAPS.full.parts, CC_TIER_CAPS.full.segs);
  const read: CcRead = makeRead();
  const box: Box = { x: 0, y: 0, w: 0, h: 0 };
  const imgs: Phaser.GameObjects.Image[] = [];
  const rows: Row[] = [];
  const ringSeq = new Int32Array(SLOTS);
  const ringBorn = new Float64Array(SLOTS).fill(-1e9);
  const crackSeq = new Int32Array(SLOTS);
  const wallPrev = new Uint8Array(SLOTS);
  const puffBorn = new Float64Array(SLOTS).fill(-1e9);
  const puffX = new Float32Array(SLOTS);
  const puffY = new Float32Array(SLOTS);
  const puffDir = new Int8Array(SLOTS);
  const teamX = new Float64Array(2);
  const teamSeen = new Uint8Array(2);
  const meleeLive = new Uint8Array(2);
  const tier: IdleTier = 'full';
  let gfx: Phaser.GameObjects.Graphics | undefined;
  let glow: Phaser.GameObjects.Graphics | undefined;
  let tick = 0;
  let fracTick = 0;
  let lastTick = -1;
  let lastRound = -1;
  let reducedNow = false;
  let contrastNow = false;
  let nRows = 0;
  let usedParts = 0;
  let usedSegs = 0;
  let nRing = 0;
  let nCrack = 0;
  let nPuff = 0;
  let sRing = 0;
  let sCrack = 0;
  let sPuff = 0;
  let sDenied = 0;
  let frozenSeen = 0;
  let slowSeen = 0;
  let lockedLeft = 0;
  let slowLeft = 0;

  const onStatus = (st: RenderStatus): void => {
    if (st.id === STATUS_FREEZE) {
      frozenSeen = 1;
      lockedLeft = Math.max(lockedLeft, st.expireTick - tick);
    } else if (st.id === STATUS_SLOW || st.id === STATUS_TIDE) {
      slowSeen = 1;
      slowLeft = Math.max(slowLeft, st.expireTick - tick);
    }
  };
  const onMelee = (p: RenderProjectile): void => {
    if (p.team === 0 || p.team === 1) meleeLive[p.team] = 1;
  };
  const onTeam = (c: RenderCharacter): void => {
    if ((c.flags & BENCHED_OR_DEAD) !== 0 || (c.team !== 0 && c.team !== 1)) return;
    teamX[c.team] = c.x + c.w / 2;
    teamSeen[c.team] = 1;
  };

  const imageAt = (n: number, frame: string): Phaser.GameObjects.Image => {
    let im = imgs[n];
    if (!im) {
      im = arena.add.image(0, 0, ATLAS_KEY, frame);
      imgs.push(im);
    }
    if (im.frame.name !== frame) im.setFrame(frame);
    return im;
  };

  const lineStroke = (g: Phaser.GameObjects.Graphics, w: number, color: number, a: number, x1: number, y1: number, x2: number, y2: number): void => {
    g.lineStyle(w, color, a).lineBetween(x1, y1, x2, y2);
  };

  const drawLines = (g: Phaser.GameObjects.Graphics, add: Phaser.GameObjects.Graphics, n: number): void => {
    for (let i = 0; i < n; i++) {
      if (usedSegs >= MAX_CC_SEGS_TOTAL) return;
      const o = i * CC_LINE_STRIDE;
      const a = out.lines[o + 4] ?? 0;
      if (a <= 0.01) continue;
      const kind = out.lines[o + 5] ?? 0;
      const x1 = out.lines[o] ?? 0;
      const y1 = out.lines[o + 1] ?? 0;
      const x2 = out.lines[o + 2] ?? 0;
      const y2 = out.lines[o + 3] ?? 0;
      usedSegs++;
      if (kind === CcLineKind.gyre) {
        if (contrastNow) lineStroke(g, 5, 0x000000, 0.5 * a, x1, y1, x2, y2);
        else lineStroke(add, 11, CC_GYRE_COLOR, a * 0.28, x1, y1, x2, y2);
        lineStroke(g, 3, CC_GYRE_COLOR, Math.min(0.95, a * 1.2), x1, y1, x2, y2);
      } else if (kind === CcLineKind.strand) {
        lineStroke(g, 6, MUCK_UNDER, a * 0.6, x1, y1, x2, y2);
        lineStroke(g, 3, STRAND_COLOR, a, x1, y1, x2, y2);
      } else {
        if (contrastNow) lineStroke(g, 4, 0x000000, 0.45 * a, x1, y1, x2, y2);
        lineStroke(g, 2.5, SCUFF_COLOR, a, x1, y1, x2, y2);
      }
    }
  };

  /** Fractured lines over the body when a Classic freeze lets go: six jagged rays that fade. Not a flash: a fade only. */
  const drawCrack = (g: Phaser.GameObjects.Graphics, add: Phaser.GameObjects.Graphics, u: number, salt: number): void => {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h * 0.5;
    const a = 0.85 * (1 - u);
    const grow = reducedNow ? 1 : 0.55 + 0.45 * Math.min(1, u * 2.5);
    for (let r = 0; r < CRACK_RAYS && usedSegs + 2 <= MAX_CC_SEGS_TOTAL; r++) {
      const dx = RAY_X[r] ?? 0;
      const dy = RAY_Y[r] ?? 0;
      const len = box.h * 0.5 * (RAY_LEN[r] ?? 0.7) * grow;
      const mx = cx + dx * len * 0.5 + (hash01(r, salt) - 0.5) * box.w * 0.1;
      const my = cy + dy * len * 0.5;
      const ex = cx + dx * len;
      const ey = cy + dy * len;
      lineStroke(g, 4, 0x0c1014, a * 0.7, cx, cy, mx, my);
      lineStroke(g, 4, 0x0c1014, a * 0.7, mx, my, ex, ey);
      lineStroke(g, 1.6, CC_LOOKS.locked.color, a, cx, cy, mx, my);
      lineStroke(g, 1.6, CC_LOOKS.locked.color, a, mx, my, ex, ey);
      if (!contrastNow) lineStroke(add, 7, CC_LOOKS.locked.color, a * 0.25, cx, cy, ex, ey);
      usedSegs += 2;
    }
  };

  const drawRing = (g: Phaser.GameObjects.Graphics, add: Phaser.GameObjects.Graphics, age: number): void => {
    const u = Math.min(1, age / RING_TICKS);
    const grow = reducedNow ? 0.6 : 0.35 + 0.65 * u;
    const fade = reducedNow ? 1 - Math.min(1, age / 6) : 1 - u;
    if (fade <= 0.02) return;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h * 0.55;
    const w = box.w * 1.5 * grow;
    const h = box.h * 0.7 * grow;
    if (contrastNow) {
      g.lineStyle(5, 0x000000, 0.5 * fade).strokeEllipse(cx, cy, w, h, 24);
    } else {
      add.lineStyle(9, RING_COLOR, 0.3 * fade).strokeEllipse(cx, cy, w, h, 24);
    }
    g.lineStyle(2.5, RING_COLOR, 0.85 * fade).strokeEllipse(cx, cy, w, h, 24);
    nRing++;
  };

  const drawPuff = (slot: number, age: number, depth: number): void => {
    const u = Math.min(1, age / PUFF_TICKS);
    const fade = (reducedNow ? 1 - Math.min(1, age / 6) : 1 - u) * 0.7;
    if (fade <= 0.02 || usedParts + 2 > MAX_CC_PARTS_TOTAL) return;
    for (let i = 0; i < 2; i++) {
      const im = imageAt(usedParts++, 'puff');
      const s = (reducedNow ? 30 : 22 + 26 * u) * (i ? 0.7 : 1) / CELL;
      im.setVisible(true).setPosition((puffX[slot] ?? 0) + (i ? -(puffDir[slot] ?? 1) * 6 : 0), (puffY[slot] ?? 0) - (reducedNow ? 0 : u * 12 * (i + 1)))
        .setScale(s, s * 0.8).setRotation(i * 0.9).setAlpha(fade * (i ? 0.7 : 1)).setTint(PUFF_COLOR).setBlendMode(0);
      if (im.depth !== depth) im.setDepth(depth);
    }
    nPuff++;
  };

  const visit = (c: RenderCharacter): void => {
    const slot = c.id & (SLOTS - 1);
    if ((c.flags & BENCHED_OR_DEAD) !== 0) {
      if (tracker.state(slot).kind !== 'none' || tracker.state(slot).release !== 'none') tracker.reset(slot);
      return;
    }
    const a = alpha();
    const x = c.px + (c.x - c.px) * a;
    const y = c.py + (c.y - c.py) * a;
    const ar = view.arcade();
    visualBox(x, y, c.w, c.h, ar ? arcadeHeroScale(c.h) : 1, box);

    frozenSeen = 0;
    slowSeen = 0;
    lockedLeft = 0;
    slowLeft = 0;
    view.forEachStatus(c.id, onStatus);
    const foe = 1 - (c.team & 1);
    read.stunLeft = ar ? ar.stunLeft(c.id) : 0;
    read.rootLeft = ar ? ar.rootLeft(c.id) : 0;
    read.rootImmuneLeft = ar ? ar.rootImmuneLeft(c.id) : 0;
    read.mireLeft = ar ? ar.mireLeft(c.id) : 0;
    read.kbSpeed = ar ? ar.kbSpeed(c.id) : 0;
    const vines = (c.flags & EntityFlag.frozen) !== 0 && (meleeLive[c.team & 1] ?? 0) === 0;
    read.locked = frozenSeen === 1 || vines;
    read.lockedLeft = frozenSeen === 1 ? lockedLeft : 0;
    read.slowed = slowSeen === 1;
    read.slowLeft = slowLeft;
    read.awaySide = teamSeen[foe] === 1 ? ((teamX[foe] ?? 0) < c.x + c.w / 2 ? 1 : -1) : 1;
    const st = tracker.update(slot, tick, read);

    // One-shot cues, each once per release or edge (a frame drawn twice for one tick does not repeat them).
    if (st.releaseFresh && st.releaseSeq !== ringSeq[slot]) {
      ringSeq[slot] = st.releaseSeq;
      if (st.breakout) {
        if (gate.allow(c.id, tick)) {
          ringBorn[slot] = tick;
          sRing++;
        } else sDenied++;
      }
      if (st.release === 'crack') {
        crackSeq[slot] = st.releaseSeq;
        sCrack++;
      }
    }
    const bounced = ar?.wallBounced(c.id) === true ? 1 : 0;
    if (bounced === 1 && wallPrev[slot] === 0) {
      puffBorn[slot] = tick;
      puffDir[slot] = (teamX[foe] ?? 0) < c.x + c.w / 2 ? -1 : 1;
      puffX[slot] = puffDir[slot] === 1 ? box.x + box.w : box.x;
      puffY[slot] = box.y + box.h * 0.8;
      sPuff++;
    }
    wallPrev[slot] = bounced;

    const salt = c.id * 977;
    const g = (gfx ??= arena.add.graphics().setDepth(CC_DEPTH));
    const add = (glow ??= arena.add.graphics().setDepth(CC_DEPTH).setBlendMode(ADD));
    let n = 0;
    const age = reducedNow ? 0 : st.age + a;
    if (st.kind !== 'none') n = ccParts(st.kind, box, age, st.left, reducedNow, tier, salt, out);
    else {
      out.nParts = 0;
      out.nSegs = 0;
    }
    if (st.release !== 'none') n = ccReleaseParts(st.release, box, st.releaseAge + (reducedNow ? 0 : a), reducedNow, tier, salt, out);
    for (let i = 0; i < n && usedParts < MAX_CC_PARTS_TOTAL; i++) {
      const p = out.parts[i];
      if (!p || p.alpha <= 0.01) continue;
      const im = imageAt(usedParts++, p.frame);
      const sc = (p.size * SIZE_BOOST) / CELL;
      im.setVisible(true).setPosition(p.x, p.y).setScale(sc, sc).setRotation(p.rot).setAlpha(Math.min(1, p.alpha)).setTint(p.color)
        .setBlendMode(GLOW_FRAMES[p.frame] && !contrastNow ? ADD : 0);
      const d = p.front ? FRONT_DEPTH : BACK_DEPTH;
      if (im.depth !== d) im.setDepth(d);
    }
    const before = usedSegs;
    drawLines(g, add, out.nSegs);
    const segs = usedSegs - before;

    if (st.release === 'crack' && crackSeq[slot] === st.releaseSeq) {
      const len = releaseTicks('crack', reducedNow);
      const ra = st.releaseAge + (reducedNow ? 0 : a);
      if (ra >= 0 && ra < len) {
        drawCrack(g, add, ra / len, salt);
        nCrack++;
      }
    }
    const rAge = fracTick - (ringBorn[slot] ?? -1e9);
    if (rAge >= 0 && rAge < RING_TICKS) drawRing(g, add, rAge);
    const pAge = fracTick - (puffBorn[slot] ?? -1e9);
    if (pAge >= 0 && pAge < PUFF_TICKS) drawPuff(slot, pAge, FRONT_DEPTH);

    if (st.kind !== 'none' || st.release !== 'none') {
      const row = (rows[nRows] ??= { id: 0, kind: 'none', release: 'none', parts: 0, segs: 0, age: 0 });
      nRows++;
      row.id = c.id;
      row.kind = st.kind;
      row.release = releaseTicks(st.release, reducedNow) > st.releaseAge ? st.release : 'none';
      row.parts = n;
      row.segs = segs;
      row.age = Math.round(st.age * 10) / 10;
    }
  };

  const draw = (): void => {
    reducedNow = reduceMotion();
    contrastNow = highContrast();
    tick = view.tick;
    fracTick = tick + alpha();
    if (tick < lastTick) {
      gate.clear();
      tracker.reset();
      ringBorn.fill(-1e9);
      puffBorn.fill(-1e9);
      wallPrev.fill(0);
      ringSeq.fill(0);
      crackSeq.fill(0);
    }
    lastTick = tick;
    const round = view.arcade()?.round ?? 0;
    if (round !== lastRound) {
      if (lastRound !== -1) {
        tracker.reset();
        ringBorn.fill(-1e9);
        puffBorn.fill(-1e9);
        wallPrev.fill(0);
        ringSeq.fill(0);
        crackSeq.fill(0);
      }
      lastRound = round;
    }
    if (!ensureAtlas(arena)) return;
    gfx?.clear();
    glow?.clear();
    nRows = 0;
    usedParts = 0;
    usedSegs = 0;
    nRing = 0;
    nCrack = 0;
    nPuff = 0;
    teamSeen[0] = 0;
    teamSeen[1] = 0;
    meleeLive[0] = 0;
    meleeLive[1] = 0;
    view.forEachCharacter(onTeam);
    view.forEachProjectile(onMelee, true);
    view.forEachCharacter(visit);
    for (let i = usedParts; i < imgs.length; i++) imgs[i]?.setVisible(false);
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    gfx?.destroy();
    glow?.destroy();
    gfx = undefined;
    glow = undefined;
    for (const im of imgs) im.destroy();
    imgs.length = 0;
    gate.clear();
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => ({
    heroes: rows.slice(0, nRows).map((r) => ({ ...r })),
    parts: usedParts,
    segs: usedSegs,
    rings: nRing,
    cracks: nCrack,
    puffs: nPuff,
    started: { ring: sRing, crack: sCrack, puff: sPuff, denied: sDenied },
    reduced: reducedNow,
    highContrast: contrastNow,
    tier,
  }));
  return (events) => {
    for (const ev of events) tracker.feed(ev, view.tick);
  };
}
