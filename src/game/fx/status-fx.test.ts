import { describe, expect, it } from 'vitest';
import { STATUS_LOOKS, StatusTracker, burstLook, chipBlink, chipFlash, chipPop, expireLook, loopAlpha, ringFraction } from './status-fx';

const cur = (...rows: [string, number, number][]): Map<string, { payload: string; start: number; expire: number }> =>
  new Map(rows.map(([k, s, e]) => [k, { payload: k, start: s, expire: e }]));

describe('status looks', () => {
  it('gives every status a distinct icon silhouette and a label', () => {
    const icons = new Set<string>();
    for (let id = 1; id <= 9; id++) {
      const l = STATUS_LOOKS[id];
      expect(l?.label).toBeTruthy();
      expect((l?.icon.length ?? 1) % 2).toBe(0);
      icons.add((l?.icon ?? []).join(','));
    }
    expect(icons.size).toBe(9);
  });
  it('marks FREEZE, SLOW and TIDE hostile only', () => {
    expect([5, 6, 9].every((i) => STATUS_LOOKS[i]?.hostile)).toBe(true);
    expect([1, 2, 3, 4, 7, 8].every((i) => !STATUS_LOOKS[i]?.hostile)).toBe(true);
  });
});

describe('timing curves', () => {
  it('burst expands and ends; reduced motion does not expand', () => {
    expect(burstLook(0, false)?.t).toBe(0);
    expect(burstLook(8, false)?.t).toBeGreaterThan(0.5);
    expect(burstLook(99, false)).toBeUndefined();
    expect(burstLook(0, true)?.t).toBe(burstLook(5, true)?.t);
  });
  it('expiry fades out and only rises with motion', () => {
    expect(expireLook(0, false)?.alpha ?? 0).toBeGreaterThan(expireLook(15, false)?.alpha ?? 1);
    expect(expireLook(5, true)?.rise).toBe(0);
    expect(expireLook(40, false)).toBeUndefined();
  });
  it('loop alpha ramps in and dims when low', () => {
    expect(loopAlpha(0, 500, false)).toBe(0);
    expect(loopAlpha(20, 500, false)).toBe(1);
    expect(loopAlpha(20, 10, true)).toBeCloseTo(0.55);
    expect(loopAlpha(20, 10, false)).toBeLessThan(1);
  });
  it('ring drains from full to empty', () => {
    expect(ringFraction(100, 100, 200)).toBe(1);
    expect(ringFraction(150, 100, 200)).toBe(0.5);
    expect(ringFraction(250, 100, 200)).toBe(0);
    expect(ringFraction(5, 10, 10)).toBe(0);
  });
  it('chip pop, flash and blink respect reduced motion', () => {
    expect(chipPop(0, false)).toBeGreaterThan(1);
    expect(chipPop(0, true)).toBe(1);
    expect(chipPop(20, false)).toBe(1);
    expect(chipFlash(0, false)).toBeGreaterThan(chipFlash(8, false));
    expect(chipFlash(30, false)).toBe(0);
    expect(chipBlink(10, true)).toBe(true);
    expect([0, 6].map((r) => chipBlink(r, false))).toEqual([true, false]);
    expect(chipBlink(200, false)).toBe(true);
  });
});

describe('StatusTracker', () => {
  it('primes without a burst, then notices applies, refreshes and expiries', () => {
    const t = new StatusTracker<string>(20);
    let live = t.update(0, cur(['a', 0, 100]));
    expect(live[0]?.born).toBe(Number.NEGATIVE_INFINITY);
    live = t.update(1, cur(['a', 0, 100], ['b', 1, 50]));
    expect(live.find((l) => l.key === 'b')?.born).toBe(1);
    expect(live.find((l) => l.key === 'a')?.born).toBe(Number.NEGATIVE_INFINITY);
    live = t.update(5, cur(['a', 5, 105], ['b', 1, 50]));
    expect(live.find((l) => l.key === 'a')?.born).toBe(5);
    t.update(6, cur(['a', 5, 105]));
    expect(t.gone().map((g) => g.key)).toEqual(['b']);
    t.update(40, cur(['a', 5, 105]));
    expect(t.gone()).toEqual([]);
  });
  it('clear re-primes', () => {
    const t = new StatusTracker<string>();
    t.update(0, cur());
    t.clear();
    expect(t.update(3, cur(['a', 3, 9]))[0]?.born).toBe(Number.NEGATIVE_INFINITY);
  });
});
