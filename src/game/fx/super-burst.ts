import type { Element } from '@core/index';

/**
 * Per-element super burst (ideas/done/ability-graphics-audit-defects): the in-world flourish at the caster when a super
 * starts, beside the cinematic band. Pure geometry (no Phaser). Each element has its own SHAPE so colour is never the only
 * cue: fire a spiked star, water concentric rings, air a swirl, earth nested squares with flung rocks (void an octagon).
 * Reduced motion: the same shape held still at a mid size, fading out on the same clock.
 */
export type BurstShape = 'star' | 'rings' | 'swirl' | 'squares' | 'octagon';
export const BURST_SHAPE: Readonly<Record<Element, BurstShape>> = { fire: 'star', water: 'rings', air: 'swirl', earth: 'squares', void: 'octagon' };
export const BURST_COLOR: Readonly<Record<Element, number>> = { fire: 0xe0761c, water: 0x3f8fd0, air: 0xb4cfd8, earth: 0xb98450, void: 0x9468c0 };
export const BURST_TICKS = 60;
export const BURST_REACH = 260;

export interface BurstPath {
  /** x,y pairs. */
  readonly pts: readonly number[];
  readonly closed: boolean;
  readonly fill: boolean;
}
export interface Burst {
  readonly paths: BurstPath[];
  readonly alpha: number;
}

/** Radius share (0..1) of the burst reach `age` ticks in: fast ease-out growth; reduced motion holds at 0.6. */
export function burstRadius(age: number, reduced: boolean): number {
  if (reduced) return 0.6;
  const k = Math.min(1, Math.max(0, age / (BURST_TICKS * 0.7)));
  return 0.25 + 0.75 * (1 - (1 - k) * (1 - k));
}

export function burstAlpha(age: number): number {
  const k = age / BURST_TICKS;
  return k < 0.5 ? 1 : Math.max(0, 1 - (k - 0.5) / 0.5);
}

function ngon(cx: number, cy: number, r: number, n: number, rot: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}

/** The burst's paths `age` view ticks after the super started, centred on (cx, cy); undefined once over. */
export function superBurst(element: Element, cx: number, cy: number, age: number, reduced: boolean): Burst | undefined {
  if (age < 0 || age > BURST_TICKS) return undefined;
  const r = BURST_REACH * burstRadius(age, reduced);
  const spin = reduced ? 0 : age * 0.05;
  const paths: BurstPath[] = [];
  switch (BURST_SHAPE[element]) {
    case 'star': {
      const pts: number[] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8 + spin * 0.3;
        const rr = i % 2 === 0 ? r : r * 0.55;
        pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      paths.push({ pts, closed: true, fill: true }, { pts: ngon(cx, cy, r * 0.3, 12, 0), closed: true, fill: true });
      break;
    }
    case 'rings':
      for (const f of [1, 0.68, 0.36]) paths.push({ pts: ngon(cx, cy, r * f, 32, 0), closed: true, fill: false });
      break;
    case 'swirl':
      for (let arm = 0; arm < 3; arm++) {
        const pts: number[] = [];
        for (let i = 0; i <= 14; i++) {
          const f = i / 14;
          const a = spin * 2 + (arm * 2 * Math.PI) / 3 + f * 2.4;
          pts.push(cx + Math.cos(a) * r * f, cy + Math.sin(a) * r * f);
        }
        paths.push({ pts, closed: false, fill: false });
      }
      break;
    case 'squares':
      for (const f of [1, 0.66, 0.33]) {
        const h = r * f * 0.8;
        paths.push({ pts: [cx - h, cy - h, cx + h, cy - h, cx + h, cy + h, cx - h, cy + h], closed: true, fill: false });
      }
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + 0.4;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        paths.push({ pts: [px, py - 11, px + 11, py, px, py + 11, px - 11, py], closed: true, fill: true });
      }
      break;
    default:
      paths.push({ pts: ngon(cx, cy, r, 8, spin), closed: true, fill: false }, { pts: ngon(cx, cy, r * 0.5, 8, -spin), closed: true, fill: false });
  }
  return { paths, alpha: burstAlpha(age) };
}
