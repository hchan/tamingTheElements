import { CAST_HOLD_MS, SUPER_HOLD_MS, applyDepth, depthTarget, stepDepth } from './pose-depth';
import { SLOTS, type PoseClock } from './pose-layer-types';
import type { Pose } from './pose-math';

/**
 * Depth step per character slot (Arcade): eased amount, dolly used, super held flag and its end, last cast pulse start and
 * level. The maths are in pose-depth.ts; this is the per-slot state and its bookkeeping, on the VFX clock.
 */
export class PoseDepthState {
  readonly z = new Float32Array(SLOTS);
  readonly dolly = new Float32Array(SLOTS).fill(1);
  readonly castAt = new Float64Array(SLOTS).fill(-1e9);
  private readonly superHeld = new Uint8Array(SLOTS);
  private readonly superUntil = new Float64Array(SLOTS);
  private readonly castZ = new Float32Array(SLOTS);
  private heldCount = 0;

  constructor(private readonly clk: PoseClock) {}

  /** A super's hold on the hero in `slot` starts now. */
  holdSuper(slot: number): void {
    if (this.superHeld[slot] !== 1) this.heldCount++;
    this.superHeld[slot] = 1;
    this.superUntil[slot] = this.clk.fxMs + SUPER_HOLD_MS;
  }

  /** Ends the holds whose time is up (call only while the sim is not frozen). */
  expireHolds(): void {
    if (this.heldCount <= 0) return;
    for (let s = 0; s < SLOTS; s++) {
      if (this.superHeld[s] === 1 && this.clk.fxMs >= (this.superUntil[s] ?? 0)) {
        this.superHeld[s] = 0;
        this.heldCount--;
      }
    }
  }

  /** A cast pulse of level `z` for the hero in `slot`; never replaces a stronger pulse that is still running. */
  castPulse(slot: number, z: number): void {
    if (this.clk.fxMs - (this.castAt[slot] ?? -1e9) < CAST_HOLD_MS && (this.castZ[slot] ?? 0) > z) return;
    this.castAt[slot] = this.clk.fxMs;
    this.castZ[slot] = z;
  }

  reset(slot: number): void {
    if (this.superHeld[slot] === 1) this.heldCount--;
    this.superHeld[slot] = 0;
    this.z[slot] = 0;
    this.dolly[slot] = 1;
    this.castAt[slot] = -1e9;
    this.castZ[slot] = 0;
  }

  /** The character is not drawn (dead, benched): back to flat, hold released; the cast pulse is kept. */
  hide(slot: number): void {
    this.z[slot] = 0;
    this.dolly[slot] = 1;
    if (this.superHeld[slot] === 1) {
      this.superHeld[slot] = 0;
      this.heldCount--;
    }
  }

  /** Steps the hero toward its target depth and applies it to `p` (last, before placing, so it sits on every other pose). */
  step(slot: number, p: Pose, bodyH: number, boxedRig: boolean): void {
    this.z[slot] = stepDepth(this.z[slot] ?? 0, depthTarget(this.superHeld[slot] === 1, this.clk.fxMs - (this.castAt[slot] ?? -1e9), this.castZ[slot] ?? 0, this.clk.reduced), this.clk.fxDt);
    this.dolly[slot] = applyDepth(p, this.z[slot] ?? 0, bodyH, boxedRig);
  }
}
