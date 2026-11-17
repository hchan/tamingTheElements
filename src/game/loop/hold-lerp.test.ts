import { describe, expect, it } from 'vitest';
import { HoldLerp } from './hold-lerp';

/** '.' = unheld step, 'F' = freeze hold, 'S' = KO slow-mo hold. Ticks past the schedule are unheld. */
type Kind = '.' | 'F' | 'S';

const V = 3;

interface Frame { drawn: (alpha: number) => number }

/** A constant-velocity mover under a hold schedule, sampled once per driver tick like the renderer does. */
function simulate(schedule: readonly Kind[]): { frames: Frame[]; h: HoldLerp } {
  const h = new HoldLerp();
  let x = 0;
  let px = 0;
  let g = 0;
  const frames: Frame[] = [];
  const kindAt = (t: number): Kind => schedule[t] ?? '.';
  const take = (t: number): void => {
    h.sample(t, g, kindAt(t) === 'F', kindAt(t) === 'S');
    const a = px;
    const b = x;
    // Copy this frame's HoldLerp state so later samples do not change it.
    const snap = Object.assign(new HoldLerp(), h);
    frames.push({ drawn: (alpha) => a + (b - a) * snap.fraction(alpha) });
  };
  take(0);
  for (let t = 0; t < schedule.length; t++) {
    if (kindAt(t) === '.') {
      px = x;
      x += V;
      g++;
    }
    take(t + 1);
  }
  return { frames, h };
}

const rep = (k: Kind, n: number): Kind[] => Array.from({ length: n }, () => k);
const slow = (pairs: number): Kind[] => Array.from({ length: pairs }, () => ['.', 'S'] as Kind[]).flat();

describe('HoldLerp', () => {
  it('all unheld: fraction is alpha bit for bit', () => {
    const h = new HoldLerp();
    for (let t = 0; t < 20; t++) {
      h.sample(t, t, false, false);
      for (const a of [0, 0.1, 0.333333333333, 0.5, 0.999999]) expect(h.fraction(a)).toBe(a);
    }
  });

  it.each([4, 6, 8, 10, 30, 40])('a %i tick freeze neither replays nor jumps the last step', (n) => {
    const { frames } = simulate(['.', '.', ...rep('F', n), '.', '.']);
    const xs = frames.flatMap((f) => [f.drawn(0), f.drawn(0.5)]);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] ?? 0);
    // Frames 3..n+1 are inside the freeze: the fighter stands still on its last position.
    const still = frames.slice(3, n + 2).map((f) => f.drawn(0.5));
    expect(new Set(still).size).toBe(1);
    // Continuous at every join (alpha 1 of one frame equals alpha 0 of the next).
    for (let i = 1; i < frames.length; i++) expect(frames[i]?.drawn(0)).toBeCloseTo(frames[i - 1]?.drawn(1) ?? NaN, 9);
  });

  it('KO freeze, then slow-mo, then normal: continuous and monotone, half speed in slow-mo', () => {
    const sched: Kind[] = ['.', '.', ...rep('F', 30), ...slow(30), '.', '.', '.'];
    const { frames } = simulate(sched);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]?.drawn(0)).toBeCloseTo(frames[i - 1]?.drawn(1) ?? NaN, 9);
      expect(frames[i]?.drawn(0.5)).toBeGreaterThanOrEqual(frames[i]?.drawn(0) ?? NaN);
    }
    const start = 2 + 30;
    const a = frames[start + 1]?.drawn(0) ?? NaN;
    const b = frames[start + 3]?.drawn(0) ?? NaN;
    expect(b - a).toBeCloseTo(V, 9);
  });

  it('end of slow-mo returns to the plain alpha', () => {
    const { frames, h } = simulate([...slow(4), '.', '.', '.']);
    expect(frames.length).toBeGreaterThan(8);
    expect(h.fraction(0.25)).toBe(0.25);
  });

  it('online stall: no new ticks leave the state alone', () => {
    const h = new HoldLerp();
    h.sample(5, 5, false, false);
    h.sample(6, 6, false, false);
    h.sample(6, 6, false, false);
    expect(h.fraction(0.5)).toBe(0.5);
  });

  describe('mixed batches (0 < dG < dW)', () => {
    const prep = (): HoldLerp => {
      const h = new HoldLerp();
      h.sample(10, 10, false, false);
      return h;
    };
    it('frozenNext: since 1, span 1', () => {
      const h = prep();
      h.sample(13, 11, true, false);
      expect(h.fraction(0)).toBe(1);
    });
    it('slowHoldNext: since 0, span 2', () => {
      const h = prep();
      h.sample(12, 11, false, true);
      expect(h.fraction(0.5)).toBe(0.25);
    });
    it('otherwise: since 0, span 1', () => {
      const h = prep();
      h.sample(12, 11, false, false);
      expect(h.fraction(0.5)).toBe(0.5);
    });
    it('all unheld before a slow-mo hold: span 2, but a freeze next keeps span 1', () => {
      const h = prep();
      h.sample(11, 11, false, true);
      expect(h.fraction(0.5)).toBe(0.25);
      h.sample(12, 12, true, true);
      expect(h.fraction(0.5)).toBe(0.5);
    });
  });

  describe('resets', () => {
    const settled = (): HoldLerp => {
      const h = new HoldLerp();
      h.sample(0, 0, false, false);
      h.sample(1, 1, false, false);
      h.sample(2, 1, false, false);
      return h;
    };
    it('tick going backwards', () => {
      const h = settled();
      h.sample(1, 1, false, false);
      expect(h.fraction(0.5)).toBe(0.5);
    });
    it('game tick going backwards', () => {
      const h = settled();
      h.sample(3, 0, false, false);
      expect(h.fraction(0.5)).toBe(0.5);
    });
    it('a jump over 8 ticks', () => {
      const h = settled();
      h.sample(12, 11, false, false);
      expect(h.fraction(0.5)).toBe(0.5);
    });
    it('explicit reset', () => {
      const h = settled();
      h.reset();
      h.sample(3, 1, false, false);
      expect(h.fraction(0.5)).toBe(0.5);
    });
  });

  it('property: a constant-velocity mover never moves backwards under seeded hold schedules', () => {
    let seed = 12345;
    const rnd = (n: number): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed >>> 8) % n;
    };
    for (let run = 0; run < 200; run++) {
      const sched: Kind[] = [];
      while (sched.length < 200) {
        const r = rnd(3);
        if (r === 0) sched.push(...rep('.', 1 + rnd(10)));
        else if (r === 1) sched.push(...rep('F', 1 + rnd(40)));
        else sched.push(...slow(1 + rnd(30)));
      }
      const { frames } = simulate(sched);
      let last = -Infinity;
      for (const f of frames) {
        for (const a of [0, 0.5, 0.99]) {
          const d = f.drawn(a);
          expect(d).toBeGreaterThanOrEqual(last - 1e-9);
          last = d;
        }
      }
    }
  });
});
