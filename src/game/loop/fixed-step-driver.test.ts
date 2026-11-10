import { describe, expect, it } from 'vitest';
import { FixedStepDriver, pauseOnHidden } from './fixed-step-driver';

function make(start = 0) {
  let t = start;
  let ticks = 0;
  const d = new FixedStepDriver({ tick: () => ticks++, now: () => t });
  return { d, ticks: () => ticks, set: (v: number) => (t = v) };
}

function run(hz: number, seconds: number): number {
  const { d, ticks } = make();
  const dt = 1000 / hz;
  const n = Math.round(hz * seconds);
  for (let i = 1; i <= n; i++) d.frame(i * dt);
  return ticks();
}

describe('FixedStepDriver', () => {
  it.each([60, 144, 30])('%i Hz frames yield ~50 ticks per second', (hz) => {
    expect(Math.abs(run(hz, 10) - 500)).toBeLessThanOrEqual(1);
  });

  it('clamps a long frame to 250 ms (capped by the step limit)', () => {
    const { d, ticks } = make();
    d.frame(10_000);
    expect(ticks()).toBe(5);
  });

  it('clamps to 250 ms with a higher step cap', () => {
    let n = 0;
    const d = new FixedStepDriver({ tick: () => n++, now: () => 0, maxStepsPerFrame: 100 });
    d.frame(10_000);
    expect(n).toBe(12);
  });

  it('caps steps, drops the remainder and counts it', () => {
    const { d, ticks } = make();
    const a = d.frame(200);
    expect(ticks()).toBe(5);
    expect(a).toBe(0);
    expect(d.droppedFrames).toBe(1);
  });

  it('returns the interpolation alpha', () => {
    const { d, ticks } = make();
    expect(d.frame(30)).toBeCloseTo(0.5);
    expect(ticks()).toBe(1);
  });

  it('pause stops ticks and resume does not replay the gap', () => {
    const { d, ticks, set } = make();
    d.frame(20);
    d.pause();
    d.frame(5000);
    expect(ticks()).toBe(1);
    set(5000);
    d.resume();
    d.frame(5020);
    expect(ticks()).toBe(2);
  });

  it('pauses when the document is hidden', () => {
    const { d } = make();
    const listeners: (() => void)[] = [];
    const doc = {
      hidden: false,
      addEventListener: (_: string, l: () => void) => void listeners.push(l),
      removeEventListener: () => undefined,
    };
    pauseOnHidden(doc as never, d);
    doc.hidden = true;
    for (const l of listeners) l();
    expect(d.isPaused).toBe(true);
    doc.hidden = false;
    for (const l of listeners) l();
    expect(d.isPaused).toBe(false);
  });
});
