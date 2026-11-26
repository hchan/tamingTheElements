import { SimEventKind, RecoveredReason, SnagEvent, abilitySlugAt, type SimEvent } from '@core/index';
import type { Box } from '../views/hero-scale';
import { tri } from '../views/pose-anim';
import { clamp01 } from '../views/pose-math';
import { hash01, mute } from './grim-fx';
import type { IdleTier } from './idle-aura';

/**
 * Crowd-control look model (idea crowd-control-animations, CA2): which control state a hero shows, its start / hold / release
 * beats and the overlay parts. Pure (no Phaser, no clock, no sim state, no trig, no Math.random, no allocation per call):
 * the pose layer (views/cc-pose.ts) and the overlay view read it. Ticks are view ticks (50 per second, fractional allowed);
 * all state is derived from the tick passed in, so calling `update` twice for one tick changes nothing. Reduced motion keeps
 * every cue but drops the motion: holds become a static tilt plus a static glyph, beats become fades of 150 ms or less.
 */

export type CcKind = 'reel' | 'stagger' | 'recoil' | 'gust' | 'locked' | 'drag' | 'mired' | 'snared' | 'flung';
export type CcKindOrNone = CcKind | 'none';

/** Highest priority first: one pose kind at a time. */
export const CC_PRIORITY: readonly CcKind[] = ['locked', 'stagger', 'gust', 'reel', 'recoil', 'snared', 'flung', 'mired', 'drag'];
const BIT: Readonly<Record<CcKind, number>> = { locked: 1, stagger: 2, gust: 4, reel: 8, recoil: 16, snared: 32, flung: 64, mired: 128, drag: 256 };

export interface CcLook {
  /** HUD / read-out word, 8 characters or fewer. */
  readonly word: string;
  /** Unit-square polyline (x,y pairs in -1..1): the glyph codes the state without colour. */
  readonly glyph: readonly number[];
  readonly closed: boolean;
  /** Muted 0xRRGGBB. */
  readonly color: number;
  readonly hostile: boolean;
}

export const CC_LOOKS: Readonly<Record<CcKind, CcLook>> = {
  reel: { word: 'STUN', closed: false, color: mute(0xa8a07a), hostile: true, glyph: [-0.9, 0.3, -0.45, -0.5, 0, 0.3, 0.45, -0.5, 0.9, 0.3] },
  stagger: { word: 'STAGGER', closed: true, color: mute(0xb08a6a), hostile: true, glyph: [-0.8, -0.8, 0.1, -0.8, -0.2, 0, 0.8, 0.2, -0.1, 0.9, -0.1, 0.1] },
  recoil: { word: 'RECOIL', closed: false, color: mute(0x9a9a8a), hostile: true, glyph: [0.9, -0.6, -0.5, -0.6, -0.9, 0, -0.5, 0.6, 0.9, 0.6] },
  gust: { word: 'WHIRL', closed: false, color: mute(0x8aa0a8), hostile: true, glyph: [0.8, -0.7, -0.6, -0.7, -0.8, -0.2, 0.6, 0.1, 0.8, 0.5, -0.4, 0.8] },
  locked: { word: 'FROZEN', closed: true, color: mute(0x86a4b0), hostile: true, glyph: [0, -1, 0.7, -0.5, 0.7, 0.5, 0, 1, -0.7, 0.5, -0.7, -0.5] },
  drag: { word: 'DRAG', closed: false, color: mute(0x768a9a), hostile: true, glyph: [-0.9, -0.5, 0.5, -0.5, 0.9, 0, 0.5, 0.5, -0.9, 0.5] },
  mired: { word: 'MIRED', closed: false, color: mute(0x6a6a52), hostile: true, glyph: [-0.9, 0.7, -0.5, 0.1, -0.1, 0.7, 0.3, 0.1, 0.7, 0.7, 0.9, 0.7] },
  snared: { word: 'SNAGGED', closed: false, color: mute(0x9a8660), hostile: true, glyph: [-0.9, 0, -0.3, -0.7, 0.3, 0.7, 0.9, 0, 0.3, -0.7, -0.3, 0.7] },
  flung: { word: 'KNOCK', closed: false, color: mute(0x9a9486), hostile: true, glyph: [-0.9, 0.8, 0.1, -0.1, -0.2, -0.1, 0.9, -0.8] },
};

/** Overlay shape names (pooled image frames or line shapes). Disjoint from IDLE_SHAPES, the ability auras and the status icons. */
export const CC_SHAPES: readonly string[] = ['mote', 'chip', 'gyre', 'muck', 'strand', 'glob', 'scuff', 'puff'];
export const CC_LINE_SHAPES: readonly string[] = ['gyre', 'strand', 'scuff'];
export const CC_FRAMES: readonly string[] = CC_SHAPES.filter((s) => !CC_LINE_SHAPES.includes(s));

/** Kinds that hold the body (locomotion and the idle motif are blended out by `hold`). */
export const CC_HOLDS: Readonly<Record<CcKind, boolean>> = {
  reel: true, stagger: true, recoil: true, gust: true, locked: true, snared: true, flung: false, mired: false, drag: false,
};

export type CcRelease = 'none' | 'shake' | 'snap' | 'settle' | 'unwind' | 'crack' | 'slack' | 'burst' | 'dissolve' | 'lighten' | 'glob';
/** Beat lengths in ms (reduced motion: a fade of at most REDUCED_RELEASE_MS). */
export const RELEASE_MS: Readonly<Record<Exclude<CcRelease, 'none'>, number>> = {
  shake: 140, snap: 60, settle: 100, unwind: 200, crack: 100, slack: 250, burst: 250, dissolve: 150, lighten: 120, glob: 200,
};
export const REDUCED_RELEASE_MS = 120;
export const TICK_MS = 20;
export const HOLD_IN_TICKS = 4;
export const SLOW_DRAG_GAIT = 0.75;
export const MIRE_GAIT = 0.6;
/** Pushed faster than this (px per tick) a hero is flung. */
export const FLUNG_MIN_SPEED = 4;
/** An armed latch that never meets its stun is dropped after this many ticks. */
export const LATCH_TIMEOUT_TICKS = 6;

export function releaseTicks(r: CcRelease, reduced: boolean): number {
  if (r === 'none') return 0;
  return (reduced ? REDUCED_RELEASE_MS : RELEASE_MS[r]) / TICK_MS;
}

/** What the sim read-outs say about one hero this frame (one reusable object per caller). */
export interface CcRead {
  stunLeft: number;
  rootLeft: number;
  rootImmuneLeft: number;
  mireLeft: number;
  kbSpeed: number;
  /** Classic: status 5 live, or the Vines victim (`frozen` with no live melee box on the team). */
  locked: boolean;
  lockedLeft: number;
  /** Status 6 or 9. */
  slowed: boolean;
  slowLeft: number;
  /** +1 when the attacker is to the left of this hero (it is thrown right), else -1. */
  awaySide: number;
}
export function makeRead(): CcRead {
  return { stunLeft: 0, rootLeft: 0, rootImmuneLeft: 0, mireLeft: 0, kbSpeed: 0, locked: false, lockedLeft: 0, slowed: false, slowLeft: 0, awaySide: 1 };
}

/** The resolved look of one hero (the tracker owns one per slot and reuses it). */
export interface CcState {
  kind: CcKindOrNone;
  /** Ticks since the kind began. */
  age: number;
  /** Ticks of the kind's own timer left (0 when it has none). */
  left: number;
  /** Timer length when the kind began. */
  total: number;
  /** 0..1 body hold, eased in over HOLD_IN_TICKS. */
  hold: number;
  /** Gait multiplier of locomotion (drag and mired scale it even under another kind). */
  gait: number;
  side: number;
  /** Tick the current kind began. */
  startTick: number;
  release: CcRelease;
  /** Tick the release began, and ticks since. */
  releaseTick: number;
  releaseAge: number;
  /** True on the tick a release began (use it to trigger one FlashGate-gated ring). */
  releaseFresh: boolean;
  /** True when the release was a cap break-out (juggle or combo cap): the view may add a ring. */
  breakout: boolean;
  /** Counts releases since the slot was reset: a release fires once per end. */
  releaseSeq: number;
  rootImmune: boolean;
}
function makeState(): CcState {
  return {
    kind: 'none', age: 0, left: 0, total: 0, hold: 0, gait: 1, side: 1, startTick: 0, release: 'none', releaseTick: -1e9, releaseAge: 1e9,
    releaseFresh: false, breakout: false, releaseSeq: 0, rootImmune: false,
  };
}

const STUN_KINDS = BIT.reel | BIT.stagger | BIT.recoil | BIT.gust;
const L_STAGGER = 0;
const L_GUST = 1;
const L_RECOIL = 2;
const LATCHES = 3;
const LATCH_KIND: readonly CcKind[] = ['stagger', 'gust', 'recoil'];

/**
 * Per-slot (hero entity id) tracker. Feed it the step's events with `feed`, then call `update(slot, tick, read)` once per frame
 * per live hero. No allocation after construction.
 */
export class CcTracker {
  private readonly states: CcState[] = [];
  private readonly latch: Int32Array;
  private readonly latchTick: Int32Array;
  private readonly prevMask: Int32Array;
  private readonly recovered: Int8Array;
  private readonly snagEnd: Int8Array;
  private readonly cleansed: Uint8Array;

  constructor(readonly slots = 8) {
    for (let i = 0; i < slots; i++) this.states.push(makeState());
    this.latch = new Int32Array(slots * LATCHES);
    this.latchTick = new Int32Array(slots * LATCHES);
    this.prevMask = new Int32Array(slots);
    this.recovered = new Int8Array(slots).fill(-1);
    this.snagEnd = new Int8Array(slots).fill(-1);
    this.cleansed = new Uint8Array(slots);
  }

  state(slot: number): CcState {
    return this.states[slot] as CcState;
  }

  reset(slot?: number): void {
    const from = slot ?? 0;
    const to = slot === undefined ? this.slots : slot + 1;
    for (let i = from; i < to; i++) {
      const s = this.states[i] as CcState;
      s.kind = 'none'; s.age = 0; s.left = 0; s.total = 0; s.hold = 0; s.gait = 1; s.release = 'none'; s.releaseTick = -1e9; s.releaseAge = 1e9;
      s.releaseFresh = false; s.breakout = false; s.releaseSeq = 0; s.rootImmune = false;
      for (let k = 0; k < LATCHES; k++) this.latch[i * LATCHES + k] = 0;
      this.prevMask[i] = 0;
      this.recovered[i] = -1;
      this.snagEnd[i] = -1;
      this.cleansed[i] = 0;
    }
  }

  private arm(slot: number, which: number, tick: number): void {
    if (slot < 0 || slot >= this.slots) return;
    const i = slot * LATCHES + which;
    if (this.latch[i] === 0) {
      this.latch[i] = 1;
      this.latchTick[i] = tick;
    }
  }

  /**
   * One sim event. Latches: a guard break (stagger), a parried MELEE attacker (recoil; a reflected shot stuns nobody, so it
   * gives nothing) and a Tornado hit (gust). Release reasons: `recovered`, `snag` (expired, freed) and `cleanse`.
   */
  feed(ev: SimEvent, tick: number): void {
    switch (ev.kind) {
      case SimEventKind.guardBroken:
        this.arm(ev.target as number, L_STAGGER, tick);
        break;
      case SimEventKind.parried:
        if (!ev.reflected) this.arm(ev.attacker as number, L_RECOIL, tick);
        break;
      case SimEventKind.hitConfirmed:
        if (abilitySlugAt(ev.ability as number) === 'tornado') this.arm(ev.target as number, L_GUST, tick);
        break;
      case SimEventKind.recovered:
        if ((ev.id as number) >= 0 && (ev.id as number) < this.slots) this.recovered[ev.id as number] = ev.reason as number;
        break;
      case SimEventKind.snag:
        if ((ev.reason === SnagEvent.expired || ev.reason === SnagEvent.freed) && (ev.id as number) < this.slots) this.snagEnd[ev.id as number] = ev.reason;
        break;
      case SimEventKind.cleanse:
        if (ev.sourceId < this.slots) this.cleansed[ev.sourceId] = 1;
        break;
      default:
        break;
    }
  }

  update(slot: number, tick: number, r: CcRead): CcState {
    const st = this.states[slot] as CcState;
    const base = slot * LATCHES;
    // Latches colour the stun they arrived with: armed -> seen with the stun -> cleared when that stun ends.
    let latched: CcKindOrNone = 'none';
    for (let k = 0; k < LATCHES; k++) {
      const i = base + k;
      if (this.latch[i] === 1) {
        if (r.stunLeft > 0) this.latch[i] = 2;
        else if (tick - (this.latchTick[i] as number) > LATCH_TIMEOUT_TICKS) this.latch[i] = 0;
      } else if (this.latch[i] === 2 && r.stunLeft <= 0) this.latch[i] = 0;
      if (this.latch[i] !== 0 && r.stunLeft > 0 && latched === 'none') latched = LATCH_KIND[k] as CcKind;
    }
    let mask = 0;
    if (r.locked) mask |= BIT.locked;
    if (r.stunLeft > 0) mask |= BIT[latched === 'none' ? 'reel' : latched];
    if (r.rootLeft > 0) mask |= BIT.snared;
    if (r.kbSpeed >= FLUNG_MIN_SPEED) mask |= BIT.flung;
    if (r.mireLeft > 0) mask |= BIT.mired;
    if (r.slowed) mask |= BIT.drag;
    let kind: CcKindOrNone = 'none';
    for (const k of CC_PRIORITY) {
      if (mask & BIT[k]) {
        kind = k;
        break;
      }
    }
    const prev = st.kind;
    if (kind !== prev) {
      // A latch arriving one frame after its stun began only re-labels the stun: no release beat.
      const relabel = r.stunLeft > 0 && STUN_KINDS & BIT[prev as CcKind] && STUN_KINDS & BIT[kind as CcKind];
      if (prev !== 'none' && !(mask & BIT[prev]) && !relabel) this.release(st, slot, prev, tick);
      st.kind = kind;
      st.startTick = tick;
      st.side = r.awaySide >= 0 ? 1 : -1;
      st.total = kind === 'none' ? 0 : ownLeft(kind, r);
    }
    st.left = kind === 'none' ? 0 : ownLeft(kind, r);
    if (st.left > st.total) st.total = st.left;
    st.age = kind === 'none' ? 0 : Math.max(0, tick - st.startTick);
    st.hold = kind !== 'none' && CC_HOLDS[kind] ? clamp01(st.age / HOLD_IN_TICKS) : 0;
    st.gait = mask & BIT.mired ? MIRE_GAIT : mask & BIT.drag ? SLOW_DRAG_GAIT : 1;
    st.rootImmune = r.rootImmuneLeft > 0;
    st.releaseAge = tick - st.releaseTick;
    st.releaseFresh = st.releaseAge === 0;
    this.prevMask[slot] = mask;
    this.recovered[slot] = -1;
    this.snagEnd[slot] = -1;
    this.cleansed[slot] = 0;
    return st;
  }

  private release(st: CcState, slot: number, ended: CcKind, tick: number): void {
    const reason = this.recovered[slot] as number;
    const cap = reason === RecoveredReason.juggleCap || reason === RecoveredReason.stunCap;
    let rel: CcRelease;
    st.breakout = false;
    switch (ended) {
      case 'reel':
      case 'stagger':
        rel = cap ? 'snap' : 'shake';
        st.breakout = cap;
        break;
      case 'recoil':
        rel = cap ? 'snap' : 'settle';
        st.breakout = cap;
        break;
      case 'gust':
        rel = cap ? 'snap' : 'unwind';
        st.breakout = cap;
        break;
      case 'locked':
        rel = 'crack';
        break;
      case 'snared':
        rel = this.cleansed[slot] ? 'dissolve' : this.snagEnd[slot] === SnagEvent.freed ? 'burst' : 'slack';
        break;
      case 'mired':
        rel = 'glob';
        break;
      case 'drag':
        rel = 'lighten';
        break;
      default:
        rel = 'settle';
        break;
    }
    st.release = rel;
    st.releaseTick = tick;
    st.releaseSeq++;
  }
}

function ownLeft(kind: CcKind, r: CcRead): number {
  switch (kind) {
    case 'reel': case 'stagger': case 'recoil': case 'gust': return r.stunLeft;
    case 'snared': return r.rootLeft;
    case 'mired': return r.mireLeft;
    case 'locked': return r.lockedLeft;
    case 'drag': return r.slowLeft;
    default: return 0;
  }
}

/** How much of the idle auras a CC dims (R3): 0 none, 1 dim to 0.4 and drop the front layer, 2 hide. */
export const CcSuppress = { none: 0, dim: 1, hide: 2 } as const;
export function ccSuppress(kind: CcKindOrNone): number {
  if (kind === 'none') return CcSuppress.none;
  return kind === 'locked' ? CcSuppress.hide : CcSuppress.dim;
}
/** Under mire the ground parts (puddles, dust, crack) are hidden. */
export function ccHidesGround(kind: CcKindOrNone): boolean {
  return kind === 'mired';
}

// ---- overlay parts -------------------------------------------------------------------------------------------------

export const CC_LINE_STRIDE = 6; // x1, y1, x2, y2, alpha, kind
export const CcLineKind = { gyre: 0, strand: 1, scuff: 2 } as const;
interface CcTierCaps {
  readonly parts: number;
  readonly segs: number;
}
/** Per hero; four heroes at the full tier stay under MAX_CC_PARTS_TOTAL and MAX_CC_SEGS_TOTAL. */
export const CC_TIER_CAPS: Readonly<Record<IdleTier, CcTierCaps>> = {
  full: { parts: 24, segs: 40 },
  phone: { parts: 12, segs: 20 },
  min: { parts: 4, segs: 0 },
};
export const MAX_CC_PARTS_TOTAL = 96;
export const MAX_CC_SEGS_TOTAL = 160;

export interface CcPart {
  x: number;
  y: number;
  size: number;
  alpha: number;
  rot: number;
  frame: string;
  color: number;
  front: boolean;
  /** Drawn behind the hero (the far half of an orbit). */
  behind: boolean;
}
export interface CcOut {
  readonly parts: CcPart[];
  readonly lines: Float32Array;
  nParts: number;
  nSegs: number;
}
export function makeCcOut(maxParts = CC_TIER_CAPS.full.parts, maxSegs = CC_TIER_CAPS.full.segs): CcOut {
  const parts: CcPart[] = [];
  for (let i = 0; i < maxParts; i++) parts.push({ x: 0, y: 0, size: 0, alpha: 0, rot: 0, frame: '', color: 0, front: false, behind: false });
  return { parts, lines: new Float32Array(maxSegs * CC_LINE_STRIDE), nParts: 0, nSegs: 0 };
}

/** Sine-like (starts at 0) and cosine-like triangle waves in -1..1 for a phase in cycles. */
const wave = (t: number): number => tri(t + 0.25) * 2 - 1;

const MOTE_COLOR = mute(0xf0c850, 0.85, 1);
const CHIP_COLOR = mute(0xa89a82);
const MUCK_COLOR = mute(0x4a4638, 0.5, 0.8);
const GYRE_COLOR = mute(0x9ab0b8);

function addPart(out: CcOut, cap: number, x: number, y: number, size: number, alpha: number, rot: number, frame: string, color: number, front: boolean, behind = false): void {
  if (out.nParts >= cap || out.nParts >= out.parts.length) return;
  const p = out.parts[out.nParts++] as CcPart;
  p.x = x; p.y = y; p.size = size; p.alpha = alpha; p.rot = rot; p.frame = frame; p.color = color; p.front = front; p.behind = behind;
}
const soft = (w: number): number => w * (1.5 - 0.5 * w * w);
/**
 * `n` parts on a tilted ellipse round (cx, cy), `t` turns in. The near half (lower on screen) is bigger, brighter and in front;
 * the far half is higher, smaller, dimmer and drawn behind the hero. Wave phases `(i + 0.5) / n` keep both halves populated.
 */
export function addOrbit(out: CcOut, cap: number, cx: number, cy: number, rx: number, ry: number, tilt: number, n: number, t: number,
  size: number, alpha: number, frame: string, color: number): void {
  for (let i = 0; i < n; i++) {
    const u = t + (i + 0.5) / n;
    const s = soft(wave(u));
    const c = soft(wave(u + 0.25));
    const near = (s + 1) / 2;
    addPart(out, cap, cx + rx * c, cy + ry * s + tilt * c, size * (0.85 + 0.25 * near), alpha * (0.65 + 0.35 * near), 0, frame, color, s > 0, s <= 0);
  }
}
function addSeg(out: CcOut, cap: number, x1: number, y1: number, x2: number, y2: number, alpha: number, kind: number): void {
  if (out.nSegs >= cap || (out.nSegs + 1) * CC_LINE_STRIDE > out.lines.length) return;
  const o = out.nSegs++ * CC_LINE_STRIDE;
  const l = out.lines;
  l[o] = x1; l[o + 1] = y1; l[o + 2] = x2; l[o + 3] = y2; l[o + 4] = alpha; l[o + 5] = kind;
}
/** A closed rounded band round the body as `n` segments (triangle-wave ellipse, no trig), turned by `turn` cycles. */
function addBand(out: CcOut, cap: number, cx: number, cy: number, rx: number, ry: number, turn: number, tilt: number, n: number, alpha: number, kind: number): void {
  let px = cx + rx * wave(turn + 0.25);
  let py = cy + ry * wave(turn) + tilt * wave(turn + 0.25);
  for (let i = 1; i <= n; i++) {
    const u = turn + i / n;
    const x = cx + rx * wave(u + 0.25);
    const y = cy + ry * wave(u) + tilt * wave(u + 0.25);
    addSeg(out, cap, px, py, x, y, alpha, kind);
    px = x;
    py = y;
  }
}

/**
 * Overlay parts of the hold of `kind` round `b`, `ageTicks` after it began with `leftTicks` of its timer left. Writes into
 * `out` (reset first) and returns the part count; `out.nSegs` is the line segment count. `salt` scatters (hash01); `tier`
 * halves the caps on phones. Reduced motion freezes the age: the same parts, still.
 */
export function ccParts(kind: CcKindOrNone, b: Box, ageTicks: number, leftTicks: number, reduced: boolean, tier: IdleTier, salt: number, out: CcOut): number {
  out.nParts = 0;
  out.nSegs = 0;
  if (kind === 'none') return 0;
  const caps = CC_TIER_CAPS[tier];
  const t = reduced ? 0 : ageTicks;
  const cx = b.x + b.w / 2;
  const headY = b.y + b.h * 0.12;
  const feetY = b.y + b.h;
  const sz = Math.max(6, b.w * 0.18);
  switch (kind) {
    case 'reel':
      if (ageTicks + leftTicks >= 30) { // spike (36), guard break, Tornado, Ice Blast; not a 12-26 tick flinch (v117)
        addOrbit(out, caps.parts, cx, headY - b.h * 0.06, b.w * 0.42, b.h * 0.07, b.h * 0.02, 4, t / 60, sz * 0.95, 0.95, 'mote', MOTE_COLOR);
      }
      break;
    case 'stagger':
      for (let i = 0; i < 2; i++) {
        const u = reduced ? 0.3 + i * 0.3 : ((t * 0.6 + i * 20) % 40) / 40;
        addPart(out, caps.parts, cx + (i ? 1 : -1) * b.w * (0.18 + hash01(i, salt) * 0.1), headY + u * b.h * 0.55, sz * 0.7, 0.75 * (1 - u * 0.7), (i ? 1 : -1) * (0.4 + u), 'chip', CHIP_COLOR, true);
      }
      break;
    case 'gust': {
      const n = reduced ? 1 : 2;
      for (let i = 0; i < n; i++) {
        addBand(out, caps.segs, cx, b.y + b.h * (0.35 + 0.3 * i), b.w * (0.55 - 0.08 * i), b.h * 0.07, reduced ? 0 : t / 60 + i * 0.5, b.h * 0.03 * (i ? -1 : 1), 8, 0.6, CcLineKind.gyre);
      }
      break;
    }
    case 'mired': {
      for (let i = 0; i < 4; i++) {
        addPart(out, caps.parts, cx + (hash01(i, salt) - 0.5) * b.w * 0.9, feetY - b.h * 0.02 - hash01(i + 9, salt) * b.h * 0.04, sz * (0.7 + hash01(i + 4, salt) * 0.5), 0.7, 0, 'muck', MUCK_COLOR, false);
      }
      if (!reduced) {
        for (let i = 0; i < 2; i++) {
          const x = cx + (i ? 1 : -1) * b.w * 0.18;
          const stretch = 0.12 + 0.12 * tri(t / 30 + i * 0.5);
          addSeg(out, caps.segs, x, feetY, x + (i ? 1 : -1) * b.w * 0.05, feetY - b.h * stretch, 0.6, CcLineKind.strand);
        }
      }
      break;
    }
    case 'flung': {
      for (let i = 0; i < 4; i++) {
        const a = reduced ? 0.4 : ((t + i * 4) % 15) / 15;
        const y = feetY - b.h * (0.04 + i * 0.05);
        addSeg(out, caps.segs, cx - b.w * 0.2 + i * b.w * 0.02, y, cx - b.w * (0.5 + 0.2 * a), y, 0.55 * (1 - a), CcLineKind.scuff);
      }
      break;
    }
    default:
      break;
  }
  return out.nParts;
}

/** Overlay of a release beat (appends to `out`): mired globs drop and fade, a gust band flies off. */
export function ccReleaseParts(release: CcRelease, b: Box, ageTicks: number, reduced: boolean, tier: IdleTier, salt: number, out: CcOut): number {
  const len = releaseTicks(release, reduced);
  if (release === 'none' || ageTicks < 0 || ageTicks >= len) return out.nParts;
  const caps = CC_TIER_CAPS[tier];
  const u = ageTicks / len;
  const cx = b.x + b.w / 2;
  const feetY = b.y + b.h;
  if (release === 'glob') {
    for (let i = 0; i < 2; i++) {
      addPart(out, caps.parts, cx + (i ? 1 : -1) * b.w * (0.15 + hash01(i, salt) * 0.1), feetY - b.h * 0.1 + (reduced ? 0 : u * b.h * 0.1), Math.max(6, b.w * 0.14), 0.7 * (1 - u), 0, 'glob', MUCK_COLOR, false);
    }
  } else if (release === 'unwind' && !reduced) {
    addBand(out, caps.segs, cx, b.y + b.h * (0.35 - 0.2 * u), b.w * (0.55 + 0.5 * u), b.h * 0.07, 0.25 + u, 0, 8, 0.6 * (1 - u), CcLineKind.gyre);
  }
  return out.nParts;
}

export { GYRE_COLOR as CC_GYRE_COLOR };
