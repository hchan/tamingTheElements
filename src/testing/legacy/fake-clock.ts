/** Deterministic clock for the legacy harness. Time only moves via `advance`. */
interface Timer {
  id: number;
  at: number;
  fn: () => void;
  every: number | null;
}

/** Crafty ran EnterFrame at ~50 fps. */
export const FRAME_MS = 20;

export class FakeClock {
  now: number;
  private nextId = 1;
  private timers: Timer[] = [];
  private frameHooks: (() => void)[] = [];
  private nextFrameAt: number;

  constructor(start = Date.UTC(2020, 0, 1)) {
    this.now = start;
    this.nextFrameAt = start + FRAME_MS;
  }

  setTimeout(fn: () => void, ms = 0): number {
    return this.add(fn, ms, null);
  }

  setInterval(fn: () => void, ms: number): number {
    return this.add(fn, ms, Math.max(1, ms));
  }

  clear(id: number | undefined): void {
    this.timers = this.timers.filter((t) => t.id !== id);
  }

  /** Called once per simulated frame (every FRAME_MS). Crafty triggers EnterFrame from here. */
  onFrame(fn: () => void): void {
    this.frameHooks.push(fn);
  }

  /** Advance time, firing timers and frame hooks in time order (timers first on ties). */
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const timer = this.nextTimer();
      const timerAt = timer ? timer.at : Infinity;
      const at = Math.min(timerAt, this.nextFrameAt);
      if (at > target) break;
      this.now = Math.max(this.now, at);
      if (timer && timerAt <= this.nextFrameAt) {
        if (timer.every === null) this.clear(timer.id);
        else timer.at += timer.every;
        timer.fn();
      } else {
        this.nextFrameAt += FRAME_MS;
        for (const hook of [...this.frameHooks]) hook();
      }
    }
    this.now = target;
  }

  private add(fn: () => void, ms: number, every: number | null): number {
    const id = this.nextId++;
    this.timers.push({ id, at: this.now + Math.max(0, ms), fn, every });
    return id;
  }

  private nextTimer(): Timer | undefined {
    let best: Timer | undefined;
    for (const t of this.timers) if (!best || t.at < best.at) best = t;
    return best;
  }
}
