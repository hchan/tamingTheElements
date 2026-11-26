import type { LockstepSession } from '../../core/net/session';
import type { SimWorld } from '../../core/sim/world';
import { EntityFlag } from '../../core/sim/state';
import { createRenderView } from '../../core/sim/view';
import { CorrectionSmoother } from '../../game/net/correction-smoother';

/** Frame-to-frame jump of the drawn x of the remote hero, with and without the correction smoother (one frame per call). */
export interface ViewJumpReport {
  readonly frames: number;
  readonly rawMax: number;
  readonly smoothMax: number;
  /** Frames whose jump exceeds `overPx`. */
  readonly rawOver: number;
  readonly smoothOver: number;
  readonly overPx: number;
}

/** Collects how far the OTHER side's active hero moves on screen between consecutive frames, through the same smoother the game uses. */
export class ViewJumpMeter {
  private readonly smoother = new CorrectionSmoother();
  private readonly view;
  private lastRaw: number | undefined;
  private lastSmooth: number | undefined;
  private frames = 0;
  private rawMax = 0;
  private smoothMax = 0;
  private rawOver = 0;
  private smoothOver = 0;

  constructor(world: SimWorld, private readonly viewerSide: number, private readonly overPx: number) {
    this.view = createRenderView(world);
  }

  /** Call once per rendered frame, after the session update. */
  frame(session: LockstepSession): void {
    this.smoother.begin(session.stats.rollbacks, session.simTick);
    this.view.forEachCharacter((c) => {
      if (c.team === this.viewerSide || (c.flags & EntityFlag.alive) === 0) return;
      const raw = c.x;
      const copy = { x: c.x, y: c.y, px: c.px, py: c.py };
      this.smoother.apply(c.id, copy);
      if (this.lastRaw !== undefined && this.lastSmooth !== undefined) {
        const r = Math.abs(raw - this.lastRaw);
        const s = Math.abs(copy.x - this.lastSmooth);
        this.rawMax = Math.max(this.rawMax, r);
        this.smoothMax = Math.max(this.smoothMax, s);
        if (r > this.overPx) this.rawOver++;
        if (s > this.overPx) this.smoothOver++;
        this.frames++;
      }
      this.lastRaw = raw;
      this.lastSmooth = copy.x;
    });
  }

  report(): ViewJumpReport {
    return { frames: this.frames, rawMax: this.rawMax, smoothMax: this.smoothMax, rawOver: this.rawOver, smoothOver: this.smoothOver, overPx: this.overPx };
  }
}
