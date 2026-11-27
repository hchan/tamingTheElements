import type Phaser from 'phaser';
import { MAX_DT_MS, type Pose } from './pose-math';

/** Character and projectile slots (entity ids are masked into them). */
export const SLOTS = 64;
const DEG = Math.PI / 180;
const STALL_MS = 80;

/** The pose layer's clocks and per-frame flags: written by `PoseLayer.frame`, only read by the modules it hands this to. */
export class PoseClock {
  /** The animation clock in ms: advances only while the sim runs (not paused, not in a hit-stop). */
  animMs = 0;
  dt = 0;
  /** The VFX clock in ms (runs through a super's hit-stop, stops on a real pause) and its last frame step. */
  fxMs = 0;
  fxDt = 0;
  frameNo = 0;
  reduced = false;
  arcade = false;
  /** Render-side hit-stop (QA r35): wall ms left to hold the animation clock after a landed hit; the sim keeps ticking. */
  holdMs = 0;
  private lastTick = -1;
  private lastTickAt = 0;

  /** One rendered frame at wall time `nowMs` that lasted `deltaMs`; `frozen` is the sim's hit-stop. */
  advance(nowMs: number, deltaMs: number, tick: number, frozen: boolean): void {
    // The sim has stopped when its tick has not changed for a few ticks (pause, overlay) or a hit-stop holds it.
    if (tick !== this.lastTick) {
      this.lastTick = tick;
      this.lastTickAt = nowMs;
    }
    const step = Math.min(Math.max(deltaMs, 0), MAX_DT_MS);
    const stalled = nowMs - this.lastTickAt > STALL_MS || frozen;
    this.dt = stalled ? 0 : step;
    if (this.holdMs > 0) {
      // Wall time burns the hold (also through a sim hit-stop), but a real pause (manual stepping, overlay) keeps it held.
      if (nowMs - this.lastTickAt <= STALL_MS) this.holdMs = Math.max(0, this.holdMs - step);
      this.dt = 0;
    }
    this.animMs += this.dt;
    // The VFX clock keeps running through a hit-stop freeze (a super's charge happens inside it) and stops only on a real pause.
    this.fxDt = nowMs - this.lastTickAt > STALL_MS && !frozen ? 0 : step;
    this.fxMs += this.fxDt;
  }
}

/** Read-out for the test probe. */
export interface PoseState {
  readonly animMs: number;
  /** Characters with a pose or locomotion effect applied on the last frame, ghosts fading, and shortest-arc rotation steps taken. */
  readonly posed: number;
  readonly ghosts: number;
  /** Ability VFX motes and glows showing. */
  readonly fx: number;
}

/** One drawn character in the sheet probe; `bodyHeight` is the display height of the body (the frame's box when it has one). */
export interface SheetDrawn {
  id: number;
  texture: string;
  frame: string;
  flipX: boolean;
  rotation: number;
  graded: boolean;
  bodyHeight: number;
  /** Eased backward-walk amount, 0..1 (backing away from the foe). */
  back: number;
  /** Idle body motif of the hero's look and the pose it added last frame (rot degrees, oy px, alpha multiplier). */
  motif: string;
  motifRot: number;
  motifOy: number;
  motifAlpha: number;
  /** World x extent of the drawn (rotated) visual box, 0.1 px: the left and right edge the viewer sees. */
  boxL: number;
  boxR: number;
  /** Depth step (pose-depth.ts): eased 0..1 amount (2 dp) and the dolly scale used (3 dp; 1 for portrait rigs). */
  depth: number;
  dolly: number;
}

/**
 * Scales `img` (top-left origin, already fitted to its visual box) by the pose about the feet point (fx, fy), rotates it about
 * that point, offsets it, and multiplies its alpha.
 */
export function posePivot(img: Phaser.GameObjects.Image, fx: number, fy: number, p: Pose): void {
  const r = p.rot * DEG;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const a = (img.x - fx) * p.sx;
  const b = (img.y - fy) * p.sy;
  img.setScale(img.scaleX * p.sx, img.scaleY * p.sy);
  img.setRotation(r);
  img.setPosition(fx + p.ox + a * cos - b * sin, fy + p.oy + a * sin + b * cos);
  if (p.alpha !== 1) img.setAlpha(img.alpha * p.alpha);
}
