import type { Element } from '@core/index';
import { tri } from './pose-anim';
import { locomotionOf } from './locomotion';
import { clamp01, type Pose } from './pose-math';
import { REDUCED_RELEASE_MS, RELEASE_MS, type CcKindOrNone, type CcRelease } from '../fx/cc-fx';

/**
 * The pose side of the crowd-control looks (CA2): per body family, the rot/ox/oy/alpha of each hold and release beat.
 * Pure maths, no Phaser. Deltas are summed, clamped (so the bounds hold whatever the style multipliers) and ADDED to
 * the pose; sx and sy are never touched. Reduced motion gives a static result that ignores the age.
 */

export type CcFamily = 'legged' | 'winged' | 'column' | 'mass' | 'flame' | 'stone' | 'void';

export const CC_ROT_MAX = 8;
export const CC_OFFSET_MAX = 6;
export const CC_ALPHA_MIN = 0.7;

export interface CcStyle {
  /** Multiplies the family amplitude. */
  readonly amp: number;
  /** Multiplies the wave periods. */
  readonly period: number;
  /** Multiplies the jiggle (mass) or the thinning (column). */
  readonly extra: number;
}
const DEFAULT_STYLE: CcStyle = { amp: 1, period: 1, extra: 1 };

/** Per sprite overrides only. */
export const CC_STYLE: Readonly<Record<string, Partial<CcStyle>>> = {
  lavax: { amp: 0.8, period: 1.3 },
  morblass: { amp: 0.6 },
  rokcore: { amp: 0.6 },
  ishimi: { extra: 1.5 },
  wispera: { extra: 1.3 },
  echo: { extra: 1.2 },
};

export function ccStyleOf(sprite: string): CcStyle {
  const o = CC_STYLE[sprite];
  return o ? { amp: o.amp ?? 1, period: o.period ?? 1, extra: o.extra ?? 1 } : DEFAULT_STYLE;
}

export function ccFamilyOf(sprite: string, element: Element | 'void' | 'none'): CcFamily {
  const loco = locomotionOf(sprite);
  if (loco.legs) return 'legged';
  if (loco.wings) return 'winged';
  switch (element) {
    case 'air': return 'column';
    case 'water': return 'mass';
    case 'fire': return 'flame';
    case 'earth': return 'stone';
    default: return 'void';
  }
}

const clamp = (v: number, lim: number): number => (v < -lim ? -lim : v > lim ? lim : v);

/** Zero-centred triangle wave in -1..1 (starts at 0), and its quadrature. */
const sinT = (t: number): number => tri(t + 0.25) * 2 - 1;
const cosT = (t: number): number => tri(t + 0.5) * 2 - 1;

interface Delta {
  rot: number;
  ox: number;
  oy: number;
  alpha: number;
}
const D: Delta = { rot: 0, ox: 0, oy: 0, alpha: 1 };

function commit(p: Pose, d: Delta): void {
  p.rot += clamp(d.rot, CC_ROT_MAX);
  p.ox += clamp(d.ox, CC_OFFSET_MAX);
  p.oy += clamp(d.oy, CC_OFFSET_MAX);
  p.alpha *= Math.min(1, Math.max(CC_ALPHA_MIN, d.alpha));
}

/** Sway amplitude (deg) and period (ms) per kind. */
function sway(kind: CcKindOrNone): { deg: number; ms: number } {
  switch (kind) {
    case 'reel': return { deg: 3, ms: 900 };
    case 'stagger': return { deg: 4, ms: 700 };
    case 'recoil': return { deg: 2, ms: 800 };
    case 'gust': return { deg: 5, ms: 600 };
    case 'snared': return { deg: 1.5, ms: 125 };
    case 'flung': return { deg: 4, ms: 1000 };
    default: return { deg: 0, ms: 1000 };
  }
}
/** Static tilt (deg) of the reduced-motion hold. */
const REDUCED_TILT: Readonly<Record<string, number>> = { reel: 3, stagger: 6, recoil: 3, gust: 4, snared: 2, flung: 3 };

/**
 * Add the hold of `kind` to `p`. `hold` is the eased-in strength 0..1, `ageMs` the time since it began, `side` is
 * +1/-1 (the way it is thrown or facing), `move` 0..1 how much the hero walks (drag, mired, flung speed).
 */
export function applyCcPose(p: Pose, kind: CcKindOrNone, family: CcFamily, style: CcStyle, hold: number, ageMs: number, side: number, move: number, reduced: boolean): void {
  if (kind === 'none') return;
  const h = clamp01(hold);
  const s = side < 0 ? -1 : 1;
  const m = clamp01(move);
  const d = D;
  d.rot = 0; d.ox = 0; d.oy = 0; d.alpha = 1;
  const amp = style.amp * h;
  if (kind === 'drag' || kind === 'mired') {
    const sink = kind === 'mired' ? 1.5 : 1;
    d.oy = (1 - m * 0.5) * sink * h;
    d.rot = (family === 'column' ? -2 : 2) * m * s * amp;
    if (!reduced && kind === 'mired' && m > 0) d.oy += 0.8 * m * tri(ageMs / 400) * h;
    commit(p, d);
    return;
  }
  if (kind === 'locked') {
    commit(p, d);
    return;
  }
  const sw = sway(kind);
  const t = ageMs / (sw.ms * style.period);
  switch (family) {
    case 'legged':
      d.oy = 2 * amp;
      d.ox = reduced ? 0 : 1.2 * sinT(t) * amp;
      break;
    case 'winged':
      d.oy = 1.5 * amp;
      d.rot = 3 * s * amp;
      break;
    case 'column':
      d.ox = reduced ? 0 : 2 * cosT(t) * amp;
      d.alpha = 1 - 0.15 * h * style.extra;
      break;
    case 'mass':
      d.oy = 2 * amp;
      d.ox = reduced ? 0 : sinT(t * 2) * amp * style.extra;
      break;
    case 'flame':
      d.alpha = reduced ? 0.9 : 0.9 + 0.1 * sinT(t * 3.5);
      break;
    case 'stone':
      d.ox = reduced ? 0 : 0.5 * sinT(t * 6) * amp;
      break;
    default:
      break;
  }
  const famRot = family === 'column' ? 1.5 : family === 'stone' ? 0.6 : family === 'mass' ? 0.4 : 1;
  d.rot += reduced ? (REDUCED_TILT[kind] ?? 0) * s * h : sw.deg * famRot * sinT(t) * amp;
  if (kind === 'snared') {
    d.rot += 3 * s * amp;
    if (!reduced) d.ox += 0.7 * (ageMs % 1000 < 400 ? 1 : 0) * sinT(ageMs / 125) * h;
  }
  if (kind === 'flung') d.rot = reduced ? 0 : -s * 6 * amp * m;
  commit(p, d);
}

/** Pose of a release beat `ageMs` after it began (a no-op outside its length). */
export function applyCcRelease(p: Pose, release: CcRelease, family: CcFamily, style: CcStyle, ageMs: number, side: number, reduced: boolean): void {
  if (release === 'none') return;
  const len = reduced ? REDUCED_RELEASE_MS : RELEASE_MS[release];
  if (ageMs < 0 || ageMs >= len) return;
  const u = ageMs / len;
  const s = side < 0 ? -1 : 1;
  const d = D;
  d.rot = 0; d.ox = 0; d.oy = 0; d.alpha = 1;
  if (reduced) {
    d.alpha = CC_ALPHA_MIN + (1 - CC_ALPHA_MIN) * u;
    commit(p, d);
    return;
  }
  const fade = 1 - u;
  switch (release) {
    case 'shake':
      d.ox = 1.5 * sinT(u * 1.5) * fade * style.amp;
      break;
    case 'snap':
      d.rot = -3 * s * fade * style.amp;
      break;
    case 'settle':
      d.rot = 2 * s * fade * style.amp;
      d.oy = 0.5 * fade;
      break;
    case 'unwind':
      d.rot = 2.5 * s * sinT(u * 1.5) * fade * style.amp;
      break;
    case 'crack':
      d.ox = sinT(u * 3) * fade;
      d.rot = 2 * s * fade;
      break;
    case 'slack':
      d.rot = 1.5 * s * fade;
      d.oy = 0.5 * fade;
      break;
    case 'burst':
      d.ox = sinT(u * 4) * fade;
      break;
    case 'dissolve':
      d.alpha = 0.9 + 0.1 * u;
      break;
    case 'lighten':
      d.oy = -1.5 * sinT(u * 0.5);
      break;
    case 'glob':
      d.oy = 0.8 * fade;
      break;
    default:
      break;
  }
  if (family === 'flame') d.oy -= 2 * fade;
  else if (family === 'winged') d.oy -= 1.5 * fade;
  commit(p, d);
}
