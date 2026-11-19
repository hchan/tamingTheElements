import { describe, expect, it } from 'vitest';
import {
  appendHistory,
  describeStatus,
  exitReason,
  finishStatus,
  isStale,
  notRunStatus,
  parseRawId,
  parseResults,
  pendingStatus,
  stateFromExit,
  unrecordedFailures,
  validateStatus,
  HISTORY_MAX,
} from '../../tools/ci/nightly-status';

const SHA = 'a'.repeat(40);
const spec = (file: string, title: string, ...statuses: string[]) => ({ title, file, tests: statuses.map((status) => ({ status })) });
const json = (specs: ReturnType<typeof spec>[]) => ({ suites: [{ title: 'x.spec.ts', file: 'x.spec.ts', specs: specs.slice(0, 1), suites: [{ title: 'inner', specs: specs.slice(1) }] }] });

describe('parseResults', () => {
  it('reads green, red and flaky specs (nested suites)', () => {
    const r = parseResults(json([spec('a.spec.ts', 'ok', 'expected'), spec('b.spec.ts', 'bad', 'unexpected'), spec('c.spec.ts', 'wobbly', 'flaky'), spec('d.spec.ts', 'skip', 'skipped')]));
    expect(r.passed).toBe(1);
    expect(r.failed).toEqual([{ file: 'b.spec.ts', title: 'bad' }]);
    expect(r.flaky).toEqual([{ file: 'c.spec.ts', title: 'wobbly' }]);
  });
  it('tolerates garbage', () => {
    expect(parseResults(null)).toEqual({ passed: 0, failed: [], flaky: [] });
    expect(parseResults({ suites: 3 }).passed).toBe(0);
  });
});

describe('known-red matching', () => {
  const failed = [
    { file: 'online-versus.spec.ts', title: 'can connect through the Online Versus screen (arcade)' },
    { file: 'other.spec.ts', title: 'can connect through the Online Versus screen' },
  ];
  it('matches by file and title substring only', () => {
    expect(unrecordedFailures(failed, [{ file: 'online-versus.spec.ts', titleIncludes: 'connect through the Online Versus' }])).toEqual([failed[1]]);
    expect(unrecordedFailures(failed, [])).toEqual(failed);
  });
});

describe('states', () => {
  it('only exit 0 or 1 with results can be pass or red', () => {
    expect(stateFromExit(0, true)).toBe('pass');
    expect(stateFromExit(1, true)).toBe('red');
    expect(stateFromExit(0, false)).toBe('not-run');
    for (const c of [89, 93, 94, 95, 96, 97, 130, 2]) {
      expect(stateFromExit(c, true)).toBe('not-run');
      expect(stateFromExit(c, false)).toBe('not-run');
      expect(exitReason(c).length).toBeGreaterThan(0);
    }
  });
  it('finishStatus records red with unrecorded split and never passes without results', () => {
    const prev = pendingStatus(SHA, 'raw-1', '2026-11-19T22:00:00Z');
    const res = { passed: 5, failed: [{ file: 'a', title: 'x' }, { file: 'b', title: 'y' }], flaky: [] };
    const red = finishStatus(prev, 1, res, [{ file: 'a', titleIncludes: 'x' }], '2026-11-20T06:00:00Z', 'PC');
    expect(red.state).toBe('red');
    expect(red.unrecorded).toEqual([{ file: 'b', title: 'y' }]);
    const lost = finishStatus(prev, 93, undefined, [], '2026-11-20T06:00:00Z', '');
    expect(lost.state).toBe('not-run');
    expect(lost.reason).toBe('PC job lost');
    expect(finishStatus(prev, 0, { passed: 3, failed: [], flaky: [] }, [], 'f', 'PC').state).toBe('pass');
  });
});

describe('staleness and text', () => {
  const t0 = Date.parse('2026-11-19T07:00:00Z');
  const pass = { ...pendingStatus(SHA, 'raw-1', '2026-11-19T00:00:00Z'), state: 'pass' as const, finishedAt: '2026-11-19T07:00:00Z' };
  it('is stale after 36 h', () => {
    expect(isStale(pass, t0 + 35 * 3600_000)).toBe(false);
    expect(isStale(pass, t0 + 37 * 3600_000)).toBe(true);
    expect(isStale({ ...pass, finishedAt: 'nonsense' }, t0)).toBe(true);
  });
  it('warns for missing, not-run and stale; lists red tests', () => {
    expect(describeStatus(undefined, t0).join('\n')).toContain('not-run');
    expect(describeStatus(notRunStatus(SHA, 's', '2026-11-19T07:00:00Z', 94, 'PC unreachable'), t0).join('\n')).toContain('PC unreachable');
    expect(describeStatus(pass, t0 + 40 * 3600_000).join('\n')).toContain('STALE');
    const red = { ...pass, state: 'red' as const, failed: [{ file: 'a.spec.ts', title: 't' }], unrecorded: [{ file: 'a.spec.ts', title: 't' }] };
    expect(describeStatus(red, t0).join('\n')).toContain('a.spec.ts: t');
  });
});

describe('misc', () => {
  it('parses a raw id and validates status files', () => {
    expect(parseRawId('queued raw-20261119-230000-full-ab12 in cpu-full')).toBe('raw-20261119-230000-full-ab12');
    expect(parseRawId('nothing')).toBeUndefined();
    expect(validateStatus(pendingStatus(SHA, 'raw-1', 's'))).toBeDefined();
    expect(validateStatus({ schema: 1 })).toBeUndefined();
    expect(validateStatus('x')).toBeUndefined();
  });
  it('trims history', () => {
    let h: string[] = [];
    for (let i = 0; i < HISTORY_MAX + 5; i++) h = appendHistory(h, pendingStatus(SHA, `raw-${String(i)}`, 's'));
    expect(h).toHaveLength(HISTORY_MAX);
    expect(h[h.length - 1]).toContain(`raw-${String(HISTORY_MAX + 4)}`);
  });
});
