import type { IdleMotifKind } from '../platform/idle-look';
import { tri } from './pose-anim';
import type { Pose } from './pose-math';

/**
 * Per-hero idle body motif (idea idle-element-auras): a tiny whole-body move while a hero stands, so each one reads as alive
 * in its own way (flame bird hovers, golem heaves, dragon flexes its wings, tree sways, blob wobbles, spirit pulses). Pure
 * (no Phaser, no clock of its own), triangle waves eased smooth, so no engine trig. Reduced motion and walking add nothing.
 * Boxed portrait rigs (ADR-0020) bake their own weight: they take only rot/ox/oy/alpha here, never sx/sy.
 */
export const MOTIF_MAX_ROT_DEG = 1.5;
export const MOTIF_MAX_OY_PX = 1.5;
export const MOTIF_MIN_ALPHA = 0.85;

/** Period in ms of each motif. */
export const MOTIF_MS: Readonly<Record<IdleMotifKind, number>> = {
  none: 1, hover: 1600, heave: 2400, wingFlex: 1800, sway: 3200, wobble: 1400, pulse: 2400,
};

/** Smoothed triangle wave in -1..1 (period 1): eased at the turns, so the move never snaps. */
export function wave(t: number): number {
  const e = tri(t);
  return e * e * (3 - 2 * e) * 2 - 1;
}

/**
 * Adds the idle motif into `p`. `stand` is 0..1 (how much the hero is standing still, eased), `ms` the animation clock,
 * `amount` the look's 0..1 intensity. Does nothing under reduced motion or while walking (`stand` 0).
 */
export function applyIdleMotif(p: Pose, kind: IdleMotifKind, ms: number, stand: number, reduced: boolean, boxed: boolean, amount = 1): void {
  if (reduced || stand <= 0 || kind === 'none') return;
  const k = Math.min(1, stand) * Math.min(1, Math.max(0, amount));
  const w = wave(ms / MOTIF_MS[kind]);
  switch (kind) {
    case 'hover':
      p.oy += w * 1 * k;
      break;
    case 'heave':
      p.oy += w * 1 * k;
      if (!boxed) p.sy *= 1 + w * 0.006 * k;
      break;
    case 'wingFlex':
      p.rot += w * 0.8 * k;
      p.oy -= (w * 0.5 + 0.5) * 1.2 * k;
      break;
    case 'sway':
      p.rot += w * MOTIF_MAX_ROT_DEG * k;
      break;
    case 'wobble':
      if (boxed) {
        p.oy += w * 0.8 * k;
      } else {
        p.sx *= 1 + w * 0.015 * k;
        p.sy *= 1 - w * 0.015 * k;
      }
      break;
    case 'pulse':
      p.alpha *= 1 - (1 - MOTIF_MIN_ALPHA) * (w * 0.5 + 0.5) * k;
      break;
  }
}
