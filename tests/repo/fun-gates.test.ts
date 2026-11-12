import { describe, expect, it } from 'vitest';
import { evaluateGates, gatesPass, latencyMark, metricValues, parseTeamSizes, tightGates } from '../../tools/ci/fun-gates';
import { funReport } from '../../tools/sim/fun-report';

describe('nightly fun gates (tools/ci/fun-gates.ts)', () => {
  it('evaluateGates judges inclusive bands and fails NaN or missing metrics', () => {
    const gates = [{ metric: 'a', min: 1, max: 2 }, { metric: 'b', min: 0, max: 1 }, { metric: 'c', min: 0, max: 1 }];
    const r = evaluateGates({ a: 2, b: 1.01, c: Number.NaN }, gates);
    expect(r.map((x) => x.ok)).toEqual([true, false, false]);
    expect(evaluateGates({}, gates).every((x) => !x.ok)).toBe(true);
  });

  it('tight bands: the 2v2 round band is longer, races stricter than report-only', () => {
    const one = tightGates(1);
    const two = tightGates(2);
    const find = (g: typeof one, m: string) => g.find((x) => x.metric === m);
    expect(find(two, 'round median s')?.min).toBeGreaterThan(find(one, 'round median s')?.min ?? 0);
    expect(find(one, 'stalemate rate')?.max).toBeLessThan(find(two, 'stalemate rate')?.max ?? 0);
    expect(find(one, 'worst race win rate')?.min).toBeGreaterThan(0.25);
  });

  it('metricValues covers every gate metric on a real small report, deterministically', () => {
    const report = funReport({ ruleset: 'arcade', teamSize: 1, aiLevel: 3, seeds: 1, seed: 1, level: 1, all: false });
    const values = metricValues(report);
    for (const g of tightGates(1)) expect(Object.keys(values)).toContain(g.metric);
    expect(metricValues(report)).toEqual(values);
  });

  it('latencyMark, parseTeamSizes and gatesPass', () => {
    expect(latencyMark(100, 4)).toBe(25);
    expect(latencyMark(100, 0)).toBeNaN();
    expect(parseTeamSizes('1,2')).toEqual([1, 2]);
    expect(() => parseTeamSizes('4')).toThrow(/bad team size/);
    const ok = { metric: 'a', min: 0, max: 1, value: 0, ok: true };
    expect(gatesPass([{ teamSize: 1, results: [ok], msPerSimSecond: 1, latencyOk: true }])).toBe(true);
    expect(gatesPass([{ teamSize: 1, results: [ok], msPerSimSecond: 99, latencyOk: false }])).toBe(false);
    expect(gatesPass([{ teamSize: 1, results: [{ ...ok, ok: false }], msPerSimSecond: 1, latencyOk: true }])).toBe(false);
  });
});
