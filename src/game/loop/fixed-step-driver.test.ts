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

  describe('scripted frame times', () => {
    /** Deterministic jitter in [-amp, amp] (no Math.random). */
    const jit = (i: number, amp: number): number => (((i * 7919) % 101) / 100 - 0.5) * 2 * amp;

    function scripted(times: number[]): { ticks: number; alphas: number[] } {
      const { d, ticks } = make();
      const alphas = times.map((t) => d.frame(t));
      return { ticks: ticks(), alphas };
    }

    it('jittery 60 Hz: tick count matches wall time and alpha stays in range', () => {
      const times: number[] = [];
      let t = 0;
      for (let i = 1; i <= 600; i++) {
        t = i * (1000 / 60) + jit(i, 3);
        times.push(t);
      }
      const r = scripted(times);
      expect(Math.abs(r.ticks - Math.floor(t / 20))).toBeLessThanOrEqual(2);
      for (const a of r.alphas) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(1);
      }
    });

    it('jittery 60 Hz: alpha advances more steadily than the raw accumulator', () => {
      const times = Array.from({ length: 300 }, (_, i) => (i + 1) * (1000 / 60) + jit(i + 1, 1.5));
      const worstOf = (alphas: number[]): number => {
        let worst = 0;
        for (let i = 40; i < alphas.length; i++) {
          const dA = ((((alphas[i] ?? 0) - (alphas[i - 1] ?? 0)) % 1) + 1) % 1;
          worst = Math.max(worst, Math.abs(dA - 1 / 3));
        }
        return worst;
      };
      // Raw reference: the same accumulator without smoothing.
      let acc = 0;
      let last = 0;
      const raw = times.map((t) => {
        acc += t - last;
        last = t;
        acc %= 20;
        return acc / 20;
      });
      expect(worstOf(scripted(times).alphas)).toBeLessThan(worstOf(raw));
    });

    it('does not double-step on one slightly slow frame', () => {
      const { d, ticks } = make();
      let t = 0;
      const per: number[] = [];
      for (let i = 0; i < 60; i++) {
        const before = ticks();
        t += i === 40 ? 19.5 : 16.67;
        d.frame(t);
        per.push(ticks() - before);
      }
      expect(Math.max(...per)).toBeLessThanOrEqual(2);
      expect(Math.abs(ticks() - Math.floor(t / 20))).toBeLessThanOrEqual(1);
    });

    it('144 Hz and 30 Hz with jitter keep 50 ticks per second', () => {
      for (const hz of [144, 30]) {
        const dt = 1000 / hz;
        const n = hz * 10;
        const times = Array.from({ length: n }, (_, i) => (i + 1) * dt + jit(i + 1, dt * 0.1));
        const r = scripted(times);
        expect(Math.abs(r.ticks - 500)).toBeLessThanOrEqual(2);
      }
    });

    it('tick count is a function of total time only, same with or without jitter', () => {
      const clean = scripted(Array.from({ length: 600 }, (_, i) => (i + 1) * (1000 / 60)));
      const dirty = scripted(Array.from({ length: 600 }, (_, i) => (i + 1) * (1000 / 60) + (i === 599 ? 0 : jit(i + 1, 3))));
      expect(Math.abs(clean.ticks - dirty.ticks)).toBeLessThanOrEqual(1);
    });

    it('tab-hidden resume: the spiral is clamped, then normal stepping returns', () => {
      const { d, ticks, set } = make();
      let t = 0;
      for (let i = 0; i < 30; i++) d.frame((t += 16.67));
      d.pause('hidden');
      d.frame((t += 60_000));
      set(t);
      d.resume('hidden');
      const before = ticks();
      d.frame((t += 16.67));
      expect(ticks() - before).toBeLessThanOrEqual(1);
      // A raw 60 s delta without pause is clamped to the step cap and the rest dropped.
      const x = ticks();
      d.frame((t += 60_000));
      expect(ticks() - x).toBe(5);
      expect(d.droppedFrames).toBeGreaterThanOrEqual(1);
      const y = ticks();
      for (let i = 0; i < 6; i++) d.frame((t += 16.67));
      expect(ticks() - y).toBe(5);
    });
  });
});
