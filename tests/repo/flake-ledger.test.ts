import { describe, expect, it } from 'vitest';
import { pickSlice, rank, refusal } from '../../tools/ci/flake-hunt';
import { mergeSummary, rollUp, specOf } from '../../tools/ci/flake-ledger';

describe('flake-ledger', () => {
  it('accumulates runs and passes and stamps lastRun', () => {
    const a = mergeSummary({}, [{ key: 'a.spec.ts: t', runs: 5, passes: 4, p90Ms: 100 }], 'D1');
    const b = mergeSummary(
      a,
      [
        { key: 'a.spec.ts: t', runs: 5, passes: 5, p90Ms: 0 },
        { key: 'b.spec.ts: u', runs: 0, passes: 0, p90Ms: 9 },
      ],
      'D2',
    );
    expect(b).toEqual({ 'a.spec.ts: t': { runs: 10, passes: 9, lastRun: 'D2', p90Ms: 100 } });
    expect(a['a.spec.ts: t']?.runs).toBe(5);
  });
  it('rolls tests up per spec file', () => {
    const l = mergeSummary(
      {},
      [
        { key: 'x.spec.ts: a', runs: 2, passes: 2, p90Ms: 10 },
        { key: 'x.spec.ts: b', runs: 2, passes: 1, p90Ms: 20 },
      ],
      'D',
    );
    expect(specOf('x.spec.ts: a')).toBe('x.spec.ts');
    expect(rollUp(l)).toEqual([{ spec: 'x.spec.ts', runs: 4, passes: 3, p90Ms: 30 }]);
  });
});

describe('flake-hunt slice picker', () => {
  const l = mergeSummary(
    {},
    [
      { key: 'ok.spec.ts: t', runs: 10, passes: 10, p90Ms: 1000 },
      { key: 'bad.spec.ts: t', runs: 10, passes: 6, p90Ms: 1000 },
      { key: 'slow.spec.ts: t', runs: 10, passes: 10, p90Ms: 90000 },
    ],
    'D',
  );
  const all = ['ok.spec.ts', 'bad.spec.ts', 'slow.spec.ts', 'new.spec.ts'];
  it('ranks never-run, then lowest pass rate, then slowest', () => {
    expect(rank(all, rollUp(l))).toEqual(['new.spec.ts', 'bad.spec.ts', 'slow.spec.ts', 'ok.spec.ts']);
  });
  it('respects the budget but always picks one', () => {
    expect(pickSlice(all, l, 0.01, 1)).toEqual(['new.spec.ts']);
    expect(pickSlice(all, l, 2, 1)).toEqual(['new.spec.ts', 'bad.spec.ts', 'ok.spec.ts']);
    expect(pickSlice(all, l, 1000, 1)).toHaveLength(4);
  });
  it('refuses CI, the Mac and a missing remote', () => {
    expect(refusal({ CI: '1' }, true)).toBeDefined();
    expect(refusal({ TTE_E2E_LOCAL: '1' }, true)).toBeDefined();
    expect(refusal({}, false)).toBeDefined();
    expect(refusal({}, true)).toBeUndefined();
  });
});
