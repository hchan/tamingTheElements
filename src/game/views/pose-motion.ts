import { lungeStretch, settlePose } from '../fx/ability-smooth';
import type { Pose } from './pose-math';

const SETTLE_MS = 260;
const SQUEEZE_MS = 260;
const SQUEEZE_SX = 0.12;
const SQUEEZE_SY = 0.06;
const SQUEEZE_PULL_PX = 4;
/** The sim tick length used to turn drawn px per frame into px per tick. */
const TICK_MS = 20;

/** One character's ability-smoothing inputs (reused by the caller; times on the VFX clock `fxMs`). */
export interface MotionInput {
  fxMs: number;
  reduced: boolean;
  settleAt: number;
  lunging: boolean;
  squeezeAt: number;
  squeezeDir: number;
}

/**
 * Ability smoothing on the body: settle squash during the recovery, lunge stretch along the drawn motion, Wyrm Coil squeeze
 * on the foe. Returns the lunge trail flag (afterimages wanted).
 */
export function abilityMotion(p: Pose, m: MotionInput, ddx: number, ddy: number, dist: number, dt: number): boolean {
  let trail = false;
  const sAge = m.fxMs - m.settleAt;
  if (sAge >= 0 && sAge < SETTLE_MS) {
    const s = settlePose(sAge / SETTLE_MS, m.reduced);
    p.sx *= s.sx;
    p.sy *= s.sy;
  }
  if (m.lunging) {
    const speed = dt > 0 ? (dist * TICK_MS) / dt : 0;
    const l = lungeStretch(speed, m.reduced);
    trail = l.trail;
    // Axis-aligned stretch along the dominant direction of the drawn motion.
    if (Math.abs(ddx) >= Math.abs(ddy)) {
      p.sx *= l.sx;
      p.sy *= l.sy;
    } else {
      p.sx *= l.sy;
      p.sy *= l.sx;
    }
  }
  const qAge = m.fxMs - m.squeezeAt;
  if (qAge >= 0 && qAge < SQUEEZE_MS && !m.reduced) {
    const bell = Math.sin((Math.PI * qAge) / SQUEEZE_MS);
    p.sx *= 1 - SQUEEZE_SX * bell;
    p.sy *= 1 + SQUEEZE_SY * bell;
    p.ox += m.squeezeDir * SQUEEZE_PULL_PX * bell;
  }
  return trail;
}

const START_MS = 100;
const STOP_MS = 170;

/**
 * Start/stop squash of a walk edge (`e` 1 start, 2 stop) `age` ms after it began: a short crouch into the heading, then a
 * small rebound as the character settles. Returns false once the edge is over.
 */
export function edgeSquash(p: Pose, e: number, age: number): boolean {
  const dur = e === 1 ? START_MS : STOP_MS;
  if (age >= dur) return false;
  const bell = Math.sin((Math.PI * age) / dur);
  p.sy *= e === 1 ? 1 - 0.06 * bell : 1 + 0.035 * bell;
  p.sx *= e === 1 ? 1 + 0.04 * bell : 1 - 0.02 * bell;
  return true;
}
