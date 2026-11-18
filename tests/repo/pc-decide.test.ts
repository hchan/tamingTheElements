import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, decide, macEligible, type Ask, type History, type LastRun, type PcView, type Step } from '../../tools/ci/pc-decide';

const L = DEFAULT_LIMITS;
const ask = (o: Partial<Ask> = {}): Ask => ({ kind: 'smoke', tests: 20, lane: 'short', laneForced: false, pc: false, detach: false, policy: 'mac', allowMac: false, ...o });
const live = (o: Partial<Extract<PcView, { lanes: unknown }>> = {}): PcView => ({ state: 'up', lanes: { short: 'idle', full: 'idle' }, gpuJobs: 0, young: false, ...o });
const busy: PcView = { state: 'busy', why: 'load', lanes: { short: 'idle', full: 'idle' }, gpuJobs: 0, young: false };
const down: PcView = { state: 'down', why: 'unreachable' };
const frames: PcView = { state: 'broken', why: 'frames' };
const disk: PcView = { state: 'broken', why: 'disk' };
const none: History = { pcAttempts: 0, macAttempts: 0 };
const after = (last: LastRun, o: Partial<History> = {}): History => ({ pcAttempts: last.where === 'pc' ? 1 : 1, macAttempts: last.where === 'mac' ? 1 : 0, last, ...o });
const pcExit = (exit: number, o: Partial<LastRun> = {}): LastRun => ({ where: 'pc', exit, ...o });
const kind = (s: Step): string => (s.do === 'fail' ? `fail ${String(s.code)}` : s.do === 'pc' && s.attach ? 'attach' : s.do === 'pc' ? `pc ${s.lane}` : s.do);

describe('probe-state table', () => {
  it.each<[string, Ask, PcView, number, number, string]>([
    ['up -> pc short', ask(), live(), 0, 0, 'pc short'],
    ['up, full ask -> pc full', ask({ kind: 'run', lane: 'full', tests: 300 }), live(), 0, 0, 'pc full'],
    ['down, short -> mac', ask(), down, 1, 0, 'mac'],
    ['down, full suite -> fail 94', ask({ kind: 'run', lane: 'full', tests: 300 }), down, 1, 0, 'fail 94'],
    ['down, flake -> fail 94', ask({ kind: 'flake' }), down, 1, 0, 'fail 94'],
    ['down, --pc -> fail 94', ask({ pc: true }), down, 1, 0, 'fail 94'],
    ['down, --pc-detach -> fail 94', ask({ detach: true }), down, 1, 0, 'fail 94'],
    ['down, 151 tests -> fail 94', ask({ tests: 151 }), down, 1, 0, 'fail 94'],
    ['down, 150 tests -> mac', ask({ tests: 150 }), down, 1, 0, 'mac'],
    ['down, unknown count -> fail 94', ask({ tests: undefined }), down, 1, 0, 'fail 94'],
    ['down, policy fail -> fail 94', ask({ policy: 'fail' }), down, 1, 0, 'fail 94'],
    ['down, policy wait -> wait', ask({ policy: 'wait' }), down, 1, 0, 'wait'],
    ['down, policy wait, cap reached -> fail 94', ask({ policy: 'wait' }), down, 1, 1800, 'fail 94'],
    ['down, allowMac lifts limit -> mac', ask({ kind: 'flake', allowMac: true }), down, 1, 0, 'mac'],
    ['busy under 10 min -> wait', ask(), busy, 1, 599, 'wait'],
    ['busy over 10 min, short -> mac', ask(), busy, 1, 600, 'mac'],
    ['busy, full suite waits past 10 min', ask({ kind: 'run', lane: 'full', tests: 300 }), busy, 1, 900, 'wait'],
    ['busy, full suite gives up at 30 min -> fail 95', ask({ kind: 'run', lane: 'full', tests: 300 }), busy, 1, 1800, 'fail 95'],
    ['busy, policy fail -> fail 95', ask({ policy: 'fail' }), busy, 1, 0, 'fail 95'],
    ['frames stall, short -> mac', ask(), frames, 1, 0, 'mac'],
    ['frames stall, full -> fail 96', ask({ kind: 'run', tests: 300, lane: 'full' }), frames, 1, 0, 'fail 96'],
    ['disk -> mac for short', ask(), disk, 1, 0, 'mac'],
    ['disk, --pc -> fail 97', ask({ pc: true }), disk, 1, 0, 'fail 97'],
  ])('%s', (_n, a, v, load, waited, want) => {
    expect(kind(decide(a, v, none, load, waited, L))).toBe(want);
  });

  it('spills a busy short lane to an idle full lane only without a GPU job', () => {
    const spill = live({ lanes: { short: 'busy', full: 'idle' } });
    expect(kind(decide(ask(), spill, none, 1, 0))).toBe('pc full');
    expect(kind(decide(ask(), live({ lanes: { short: 'busy', full: 'idle' }, gpuJobs: 1 }), none, 1, 0))).toBe('pc short');
    expect(kind(decide(ask(), live({ lanes: { short: 'busy', full: 'busy' } }), none, 1, 0))).toBe('pc short');
    expect(kind(decide(ask({ laneForced: true }), spill, none, 1, 0))).toBe('pc short');
  });

  it('a forced full lane is not a short-only run', () => {
    expect(macEligible(ask({ laneForced: true, lane: 'full' }), L)).toBe(false);
  });
});

describe('Mac load guard', () => {
  it('runs at load 14, waits above it, polls every 2 minutes', () => {
    expect(kind(decide(ask(), down, none, 14, 0))).toBe('mac');
    const w = decide(ask(), down, none, 14.1, 0);
    expect(w).toMatchObject({ do: 'wait', sec: 120 });
  });
  it('gives up with exit 89 after 900 s', () => {
    expect(decide(ask(), down, none, 20, 800)).toMatchObject({ do: 'wait', sec: 100 });
    expect(decide(ask(), down, none, 20, 900)).toMatchObject({ do: 'fail', code: 89 });
  });
  it('the guard also applies after a PC exit', () => {
    expect(kind(decide(ask(), down, after(pcExit(94)), 20, 0))).toBe('wait');
    expect(kind(decide(ask(), down, after(pcExit(94)), 3, 0))).toBe('mac');
  });
  it('a busy PC fallback counts the guard wait from the end of the busy wait', () => {
    expect(kind(decide(ask(), busy, none, 20, 600))).toBe('wait');
    expect(decide(ask(), busy, none, 20, 1500)).toMatchObject({ do: 'fail', code: 89 });
  });
});

describe('after-PC-exit table', () => {
  it.each<[string, LastRun, PcView, string]>([
    ['0 final', pcExit(0), down, 'fail 0'],
    ['1 final', pcExit(1), down, 'fail 1'],
    ['2 final', pcExit(2), live(), 'fail 2'],
    ['124 final', pcExit(124), live(), 'fail 124'],
    ['130 final', pcExit(130), live(), 'fail 130'],
    ['93 lost, PC up -> retry pc', pcExit(93), live(), 'pc short'],
    ['93 lost, PC down -> mac', pcExit(93), down, 'mac'],
    ['93 memory guard final', pcExit(93, { stage: 'memory' }), live(), 'fail 93'],
    ['255 -> attach', pcExit(255), live(), 'attach'],
    ['94 -> mac', pcExit(94), down, 'mac'],
    ['95 -> mac', pcExit(95), busy, 'mac'],
    ['96 fresh stall -> mac', pcExit(96, { stallSec: 60 }), frames, 'mac'],
    ['96 old stall -> retry pc', pcExit(96, { stallSec: 700 }), live(), 'pc short'],
    ['92 -> retry pc', pcExit(92), live(), 'pc short'],
    ['92 PC down -> mac', pcExit(92), down, 'mac'],
    ['3 upload -> retry pc', pcExit(3, { stage: 'upload' }), live(), 'pc short'],
    ['3 fetch final', pcExit(3, { stage: 'fetch' }), live(), 'fail 3'],
    ['97 -> mac', pcExit(97), disk, 'mac'],
    ['98 -> mac', pcExit(98), live(), 'mac'],
    ['99 -> mac', pcExit(99), live(), 'mac'],
    ['unknown code final', pcExit(42), live(), 'fail 42'],
  ])('%s', (_n, last, v, want) => {
    expect(kind(decide(ask(), v, after(last), 1, 0))).toBe(want);
  });

  it('second attempt exits go to the Mac, not a third PC run', () => {
    const h: History = { pcAttempts: 2, macAttempts: 0, last: pcExit(93) };
    expect(kind(decide(ask(), live(), h, 1, 0))).toBe('mac');
    expect(kind(decide(ask({ kind: 'run', tests: 400, lane: 'full' }), live(), h, 1, 0))).toBe('fail 93');
  });
  it('255 re-attaches once, then Mac', () => {
    expect(kind(decide(ask(), live(), after(pcExit(255), { reattached: true }), 1, 0))).toBe('mac');
  });
  it('full suite never falls back after a PC failure', () => {
    for (const x of [94, 95, 96, 97, 98, 99, 255]) {
      const a = ask({ kind: 'run', tests: 400, lane: 'full' });
      const s = decide(a, down, after(pcExit(x, { stallSec: 1 }), { reattached: true }), 1, 0);
      expect(s).toMatchObject({ do: 'fail', code: x });
    }
  });
  it('--pc forces fail even for short runs', () => {
    expect(kind(decide(ask({ pc: true }), down, after(pcExit(94)), 1, 0))).toBe('fail 94');
  });
  it('after a Mac exit 75 goes back to the PC when up; other exits are final', () => {
    expect(kind(decide(ask(), live(), after({ where: 'mac', exit: 75 }, { pcAttempts: 0 }), 1, 0))).toBe('pc short');
    expect(kind(decide(ask(), down, after({ where: 'mac', exit: 75 }, { pcAttempts: 0 }), 1, 0))).toBe('fail 75');
    expect(kind(decide(ask(), live(), after({ where: 'mac', exit: 1 }), 1, 0))).toBe('fail 1');
    expect(kind(decide(ask(), live(), after({ where: 'mac', exit: 0 }), 1, 0))).toBe('fail 0');
  });
});

describe('invariants', () => {
  const views: PcView[] = [live(), busy, down, frames, disk, { state: 'down', why: 'wsl' }];
  const asks: Ask[] = [ask(), ask({ kind: 'run', tests: 400, lane: 'full' }), ask({ policy: 'wait' }), ask({ allowMac: true, kind: 'flake', tests: undefined }), ask({ pc: true })];
  const exits = [0, 1, 2, 3, 75, 89, 92, 93, 94, 95, 96, 97, 98, 99, 124, 130, 255];
  const stages: (LastRun['stage'] | undefined)[] = [undefined, 'upload', 'fetch', 'memory'];

  it('never Mac after PC exit 0 or 1, never a second Mac attempt, never a third PC attempt', () => {
    for (const a of asks) for (const v of views) for (const x of exits) for (const st of stages) for (const pcA of [1, 2]) for (const macA of [0, 1]) for (const re of [false, true]) {
      const h: History = { pcAttempts: pcA, macAttempts: macA, reattached: re, last: pcExit(x, { ...(st ? { stage: st } : {}), stallSec: 5 }) };
      for (const [load, waited] of [[1, 0], [30, 0], [30, 1000]] as const) {
        const s = decide(a, v, h, load, waited);
        if (x === 0 || x === 1) expect(s).toMatchObject({ do: 'fail', code: x });
        if (macA >= 1) expect(s.do).not.toBe('mac');
        if (s.do === 'pc' && !s.attach) expect(pcA).toBeLessThan(2);
        if (s.do === 'mac') expect(macEligible(a, L)).toBe(true);
      }
    }
  });
  it('--pc and --pc-detach never reach the Mac, with or without a policy', () => {
    for (const a of [ask({ pc: true }), ask({ detach: true }), ask({ pc: true, policy: 'mac' })]) {
      for (const v of views) {
        for (const h of [none, after(pcExit(94)), after(pcExit(96, { stallSec: 1 }))]) expect(decide(a, v, h, 1, 5000).do).not.toBe('mac');
      }
    }
  });
});
