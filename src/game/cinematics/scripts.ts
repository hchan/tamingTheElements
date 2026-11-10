import type { CinematicScript, Rect } from './runner';
import { DISTURBANCE_SCRIPT } from './scripts/disturbance';
import { PRIA_SCRIPT } from './scripts/pria';

const W = 1280;
const H = 720;
const SHORT = Math.min(W, H);

/** Centered square, `SHORT * scale` on a side (legacy cinematics size everything from the short side). */
function centered(scale: number): Rect {
  const s = SHORT * scale;
  return { x: (W - s) / 2, y: (H - s) / 2, w: s, h: s };
}

/**
 * Opening cinematics ported from `scenes.js` (Homeworld: Pria, The Disturbance); texture keys use the load-list namespaces.
 * The texts come from the story scripts (one copy of each line, in the entry chunk).
 */
export const INTRO_SCRIPT: CinematicScript = [
  { kind: 'background', key: 'bg:stars' },
  { kind: 'sprite', id: 'pria', key: 'sprite:pria', rect: centered(0.5), alpha: 0.5 },
  { kind: 'tween', id: 'pria', to: { alpha: 1, spin: 40 }, ms: 4000 },
  { kind: 'header', text: PRIA_SCRIPT.title, ms: 2000 },
  { kind: 'caption', text: PRIA_SCRIPT.caption.text },
  { kind: 'waitKey' },
  { kind: 'sprite', id: 'fire', key: 'sprite:chaoticFire', rect: centered(0.5), alpha: 0 },
  { kind: 'tween', id: 'fire', to: { alpha: 0.5, ...grow(centered(0.5), 1.5) }, ms: 3000 },
  { kind: 'header', text: DISTURBANCE_SCRIPT.title, ms: 2000 },
  { kind: 'caption', text: DISTURBANCE_SCRIPT.caption.text },
  { kind: 'waitKey' },
];

function grow(r: Rect, factor: number): Rect {
  const w = r.w * factor;
  const h = r.h * factor;
  return { x: r.x - (w - r.w) / 2, y: r.y - (h - r.h) / 2, w, h };
}
