import { describe, expect, it } from 'vitest';
import { evaluateGates, gatesPass, latencyMark, loadGateConfig, metricValues, parseTeamSizes, tightGates } from '../../tools/ci/fun-gates';
import { SimEventKind, type SimEvent } from '../../src/core/sim/events';
import { reduceFunMetrics, summarizeFun } from '../../tools/sim/fun-metrics';
import { funReport } from '../../tools/sim/fun-report';

describe('nightly fun gates (tools/ci/fun-gates.ts)', () => {
  it('evaluateGates judges inclusive bands and fails NaN or missing metrics', () => {
    const gates = [{ metric: 'a', min: 1, max: 2 }, { metric: 'b', min: 0, max: 1 }, { metric: 'c', min: 0, max: 1 }];
    const r = evaluateGates({ a: 2, b: 1.01, c: Number.NaN }, gates);
    expect(r.map((x) => x.ok)).toEqual([true, false, false]);
    expect(evaluateGates({}, gates).every((x) => !x.ok)).toBe(true);
  });

  it('tight bands: the 2v2 round band is longer, stalemates near zero, races stricter than report-only', () => {
    const one = tightGates(1);
    const two = tightGates(2);
    const find = (g: typeof one, m: string) => g.find((x) => x.metric === m);
    expect(find(two, 'round median s')?.min).toBeGreaterThan(find(one, 'round median s')?.min ?? 0);
    expect(find(one, 'stalemate rate')?.max).toBeLessThanOrEqual(0.01);
    expect(find(two, 'stalemate rate')?.max).toBeLessThanOrEqual(0.01);
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

  it('new pace metrics: hits per minute, comeback rate and multi-hit combo share on synthetic matches', () => {
    let seq = 0;
    const ev = (tick: number, kind: number, p: Record<string, number> = {}): SimEvent => ({ ...p, tick, sourceId: 0, kind, seq: seq++ }) as SimEvent;
    const hit = (tick: number, attacker: number, amount: number): SimEvent => ev(tick, SimEventKind.hitConfirmed, { attacker, target: 1 - attacker, ability: 1, amount });
    const meta = { ticks: 3000, endReason: 'ko', teamOf: (id: number) => id } as const; // 60 s
    const swing = reduceFunMetrics([hit(10, 0, 10), hit(20, 1, 30), ev(30, SimEventKind.comboEnded, { hits: 2 }), ev(40, SimEventKind.comboEnded, { hits: 1 })], meta);
    const wire = reduceFunMetrics([hit(10, 0, 10), hit(20, 0, 10), ev(30, SimEventKind.comboEnded, { hits: 2 })], meta);
    const s = summarizeFun([swing, wire]);
    expect(s.hitsPerMinute).toBe(2); // 4 hits over 120 s
    expect(s.comebackRate).toBe(0.5); // only the swing match changed hands
    expect(s.multiHitComboShare).toBeCloseTo(0.667, 3); // 2 of 3 combos
    expect(summarizeFun([])).toMatchObject({ hitsPerMinute: 0, comebackRate: 0, multiHitComboShare: 0 });
  });

  it('the committed fun-gates.json has the same metrics for every team size and sane bands', () => {
    const cfg = loadGateConfig();
    const names = (t: 1 | 2) => tightGates(t, cfg).map((g) => g.metric).sort();
    expect(names(1)).toEqual(names(2));
    for (const t of [1, 2] as const) for (const g of tightGates(t, cfg)) expect(g.min).toBeLessThanOrEqual(g.max);
    expect(cfg.latencyCeilingMsPerSimSecond).toBeGreaterThan(0);
    expect(() => tightGates(3, cfg)).toThrow(/no fun-gate bands/);
  });
});
