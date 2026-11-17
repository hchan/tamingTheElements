/** Fixed 50 Hz step driver: accumulates real time and runs whole ticks; the clock is injected. */
export const STEP_MS = 20;
export const MAX_FRAME_MS = 250;
export const MAX_STEPS_PER_FRAME = 5;

/**
 * Why the sim is held. Reasons are tracked separately so lifting one (the tab becoming visible again)
 * never resumes a sim another reason (the user's pause dialog) still holds.
 */
export type PauseReason = 'user' | 'hidden' | 'overlay' | 'replay' | 'ended';

export interface FixedStepDriverOptions {
  readonly tick: () => void;
  /** Monotonic ms clock, e.g. `() => performance.now()`. */
  readonly now: () => number;
  readonly stepMs?: number;
  readonly maxFrameMs?: number;
  readonly maxStepsPerFrame?: number;
}

/** Frame-delta smoothing: how many recent deltas estimate the display period, and how close to it a delta must be to snap. */
const PERIOD_WINDOW = 8;
const SNAP_FRACTION = 0.25;
const MIN_PERIOD_MS = 4;
const MAX_PERIOD_MS = 40;

export class FixedStepDriver {
  private readonly recent: number[] = [];
  /** Wall time not yet handed to the accumulator because snapping replaced a delta (always folded back, so no drift). */
  private owed = 0;
  private acc = 0;
  private last: number;
  private readonly reasons = new Set<PauseReason>();
  private alpha = 0;
  private dropped = 0;
  private readonly tick: () => void;
  private readonly now: () => number;
  private readonly stepMs: number;
  private readonly maxFrameMs: number;
  private readonly maxSteps: number;

  constructor(opts: FixedStepDriverOptions) {
    this.tick = opts.tick;
    this.now = opts.now;
    this.stepMs = opts.stepMs ?? STEP_MS;
    this.maxFrameMs = opts.maxFrameMs ?? MAX_FRAME_MS;
    this.maxSteps = opts.maxStepsPerFrame ?? MAX_STEPS_PER_FRAME;
    this.last = this.now();
  }

  /** Advances by real time (`nowMs` defaults to the injected clock); returns the render alpha in [0,1). */
  frame(nowMs: number = this.now()): number {
    if (this.reasons.size > 0) return this.alpha;
    this.acc += this.smooth(Math.min(Math.max(nowMs - this.last, 0), this.maxFrameMs));
    this.last = nowMs;
    let steps = 0;
    while (this.acc >= this.stepMs && steps < this.maxSteps) {
      this.tick();
      this.acc -= this.stepMs;
      steps++;
    }
    if (this.acc >= this.stepMs) {
      this.acc = 0;
      this.dropped++;
    }
    this.alpha = this.acc / this.stepMs;
    return this.alpha;
  }

  /**
   * Vsync-aligned delta: rAF timestamps jitter around the display period, so a 16.0 ms frame followed by 17.4 ms would let
   * the accumulator (and alpha) wobble and occasionally double-step. A delta within a quarter of a whole number of display
   * periods (the median of the recent deltas) is replaced by that multiple; the difference is owed and folded into a later
   * frame, so total simulated time still equals wall time and tick counts do not drift. Other deltas pass through untouched.
   */
  private smooth(dt: number): number {
    if (dt <= 0 || dt >= this.maxFrameMs) {
      this.recent.length = 0;
      this.owed = 0;
      return dt;
    }
    this.recent.push(dt);
    if (this.recent.length > PERIOD_WINDOW) this.recent.shift();
    if (this.recent.length < PERIOD_WINDOW) return dt;
    const period = [...this.recent].sort((a, b) => a - b)[PERIOD_WINDOW >> 1] ?? dt;
    if (period < MIN_PERIOD_MS || period > MAX_PERIOD_MS) return dt;
    const k = Math.max(1, Math.round(dt / period));
    if (Math.abs(dt - k * period) > period * SNAP_FRACTION) return dt;
    const snapped = k * period;
    this.owed += dt - snapped;
    // Settle the debt a frame at a time, never more than a quarter period, so the output stays near vsync.
    const pay = Math.max(-period * SNAP_FRACTION, Math.min(period * SNAP_FRACTION, this.owed)) * 0.5;
    this.owed -= pay;
    return snapped + pay;
  }

  /** Adds a hold for `reason` (default `user`, which also covers manual test stepping). */
  pause(reason: PauseReason = 'user'): void {
    this.reasons.add(reason);
  }

  /** Removes the hold for `reason`; the sim runs again only when no other reason remains. */
  resume(reason: PauseReason = 'user'): void {
    if (!this.reasons.delete(reason) || this.reasons.size > 0) return;
    this.last = this.now();
    this.recent.length = 0;
    this.owed = 0;
  }

  /** True while any reason holds the sim. */
  get isPaused(): boolean {
    return this.reasons.size > 0;
  }

  isPausedFor(reason: PauseReason): boolean {
    return this.reasons.has(reason);
  }

  /** Number of frames whose leftover time was discarded because the step cap was hit. */
  get droppedFrames(): number {
    return this.dropped;
  }
}

/** Auto-pauses while the document is hidden; returns an unsubscribe function. */
export function pauseOnHidden(
  doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'hidden'>,
  driver: FixedStepDriver,
): () => void {
  const onChange = (): void => {
    if (doc.hidden) driver.pause('hidden');
    else driver.resume('hidden');
  };
  doc.addEventListener('visibilitychange', onChange);
  return () => {
    doc.removeEventListener('visibilitychange', onChange);
  };
}
