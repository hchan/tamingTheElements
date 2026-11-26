/**
 * Visual-only blend of rollback corrections. A rollback re-simulates and can move a fighter a few px in one frame; drawing that
 * jump looks like a snap. The smoother keeps the drawn position continuous and decays the difference over a few frames.
 * It never touches the sim: it only shifts the px/x (and py/y) the renderer reads.
 */
import { CORRECTION_DECAY, CORRECTION_MAX_PX, CORRECTION_MIN_PX } from './online-tuning';

interface Pos { x: number; y: number; }
interface Drawn { x: number; y: number; px: number; py: number; }

export class CorrectionSmoother {
  private lastRollbacks = 0;
  private lastTick = 0;
  private advanced = 0;
  private corrected = false;
  private readonly lastSim = new Map<number, Pos>();
  private readonly offset = new Map<number, Pos>();

  /** Once per frame, before drawing: the session's running rollback count and sim tick (to know how far the sim moved since the last frame). */
  begin(rollbacks: number, simTick: number): void {
    this.corrected = rollbacks !== this.lastRollbacks;
    this.lastRollbacks = rollbacks;
    this.advanced = Math.max(0, simTick - this.lastTick);
    this.lastTick = simTick;
  }

  /** Per character per frame: shifts `c` (the render copy) by the decaying correction offset. */
  apply(id: number, c: Drawn): void {
    const last = this.lastSim.get(id);
    let off = this.offset.get(id);
    if (last) {
      if (this.corrected) {
        // Where the fighter would have been drawn had the old history held: last drawn sim position plus the normal steps since.
        // Only the gap to that is a misprediction; ordinary motion must not be blended or the fighter would pause on every rollback.
        const dx = last.x + this.advanced * (c.x - c.px) - c.x;
        const dy = last.y + this.advanced * (c.y - c.py) - c.y;
        if (Math.abs(dx) > CORRECTION_MAX_PX || Math.abs(dy) > CORRECTION_MAX_PX) off = undefined; // a teleport or respawn: do not drag
        else if (Math.abs(dx) >= CORRECTION_MIN_PX || Math.abs(dy) >= CORRECTION_MIN_PX) {
          off = { x: (off?.x ?? 0) + dx, y: (off?.y ?? 0) + dy };
        }
      }
    }
    if (off) {
      off.x *= CORRECTION_DECAY;
      off.y *= CORRECTION_DECAY;
      if (Math.abs(off.x) < 0.5 && Math.abs(off.y) < 0.5) off = undefined;
    }
    if (off) this.offset.set(id, off); else this.offset.delete(id);
    if (last) { last.x = c.x; last.y = c.y; } else this.lastSim.set(id, { x: c.x, y: c.y });
    if (off) { c.x += off.x; c.px += off.x; c.y += off.y; c.py += off.y; }
  }

  clear(): void { this.lastSim.clear(); this.offset.clear(); }
}
