import { describe, expect, it } from 'vitest';
import { FLAKE_JOB, JOBS } from '../../tools/ci/nightly-install';
import { budgetMin, decide, hardStop, skipReason } from '../../tools/ci/nightly-flake';
import type { Probe } from '../../tools/ci/pc-probe';

const up = (o: { state?: 'up' | 'busy'; why?: 'load'; gpuJobs?: number; gpuTemp?: number; memMb?: number } = {}): Probe => ({
  state: 'up', lanes: { short: 'idle', full: 'idle' }, gpuJobs: 0, young: false, at: 0, gpuTemp: 50, memMb: 16384, ...o,
});
const at0030 = new Date(2026, 10, 22, 0, 30);

describe('nightly flake slice skip logic', () => {
  it('runs on a healthy idle PC', () => {
    expect(skipReason(up())).toBeUndefined();
    expect(decide(up(), at0030, true, false)).toMatchObject({ action: 'run', budgetMin: 360 });
  });
  it('skips when the probe is unhealthy', () => {
    expect(skipReason({ state: 'down', why: 'unreachable', at: 0 })).toMatch(/down/);
    expect(skipReason({ state: 'broken', why: 'disk', at: 0 })).toMatch(/broken/);
    expect(skipReason(up({ state: 'busy', why: 'load' }))).toMatch(/busy/);
  });
  it('skips at 80 C or more, not at 79', () => {
    expect(skipReason(up({ gpuTemp: 80 }))).toMatch(/80 C/);
    expect(skipReason(up({ gpuTemp: 79 }))).toBeUndefined();
  });
  it('skips under 4 GB free RAM, not at exactly 4 GB', () => {
    expect(skipReason(up({ memMb: 4095 }))).toMatch(/RAM/);
    expect(skipReason(up({ memMb: 4096 }))).toBeUndefined();
  });
  it('skips while a GPU job runs', () => {
    expect(skipReason(up({ gpuJobs: 1 }))).toMatch(/GPU job/);
    expect(decide(up({ gpuJobs: 1 }), at0030, true, false).action).toBe('skip');
  });
  it('never runs unless enabled, and never with --dry-run', () => {
    expect(decide(up(), at0030, false, false).action).toBe('dry-run');
    expect(decide(up(), at0030, true, true).action).toBe('dry-run');
  });
  it('skip beats enabled', () => {
    expect(decide(up({ gpuTemp: 85 }), at0030, true, false).action).toBe('skip');
  });
});

describe('nightly flake hard stop', () => {
  it('stops at 06:30 local and skips when under 10 minutes remain', () => {
    expect(new Date(hardStop(at0030)).getHours()).toBe(6);
    expect(budgetMin(new Date(2026, 10, 22, 6, 0))).toBe(30);
    expect(decide(up(), new Date(2026, 10, 22, 6, 25), true, false).action).toBe('skip');
  });
});

describe('nightly flake install', () => {
  it('is opt-in: not in the default job list, 00:30', () => {
    expect(JOBS).not.toContain(FLAKE_JOB);
    expect(FLAKE_JOB).toMatchObject({ hour: 0, minute: 30, script: 'tools/ci/nightly-flake.ts' });
  });
});
