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

export class FixedStepDriver {
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
    this.acc += Math.min(Math.max(nowMs - this.last, 0), this.maxFrameMs);
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

  /** Adds a hold for `reason` (default `user`, which also covers manual test stepping). */
  pause(reason: PauseReason = 'user'): void {
    this.reasons.add(reason);
  }

  /** Removes the hold for `reason`; the sim runs again only when no other reason remains. */
  resume(reason: PauseReason = 'user'): void {
    if (!this.reasons.delete(reason) || this.reasons.size > 0) return;
    this.last = this.now();
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
