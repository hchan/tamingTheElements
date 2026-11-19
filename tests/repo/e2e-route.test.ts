import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSpec, limitsOf, newId, parseArgs, pickLane, policyOf, redact, repeatOf, route, runPc, runRouted, serverTrouble, summarize, UsageError, type Deps, type Io, type Parsed } from '../../tools/ci/e2e-route';
import type { PcView } from '../../tools/ci/pc-decide';
import { renderJob } from '../../tools/ci/pc-job';
import type { Remote } from '../../tools/ci/pc-remote';
import { CtlError, type QueueClient } from '../../tools/gpu-queue/client';

const FAKE = resolve('tests/repo/fixtures/fake-ssh.sh');
const P = (...a: string[]): Parsed => parseArgs(a);
const sink = (): { write(c: Buffer | string): void; text(): string } => {
  const chunks: string[] = [];
  return { write: (c) => void chunks.push(c.toString()), text: () => chunks.join('') };
};

describe('parseArgs', () => {
  it('splits router flags from Playwright args and drops bare --', () => {
    const p = P('run', '--', '--pc-lane', 'short', '--pc-include', 'a/b', '--pc-fetch', 'c', '--pc-detach', '--workers', '2', '--grep', 'x y', 'tests/e2e/a.spec.ts');
    expect(p).toMatchObject({ kind: 'run', lane: 'short', include: ['a/b'], fetch: ['c'], detach: true, workers: 2, rest: ['--grep', 'x y', 'tests/e2e/a.spec.ts'] });
  });
  it('--smoke switches the kind; --pc and --local conflict; bad values throw', () => {
    expect(P('run', '--smoke').kind).toBe('smoke');
    expect(() => P('run', '--pc', '--local')).toThrow(UsageError);
    expect(() => P('run', '--pc-lane', 'x')).toThrow(UsageError);
    expect(() => P('run', '--pc-attach')).toThrow(UsageError);
    expect(() => P('nope')).toThrow(UsageError);
  });
  it('--workers passes through for flake (the flake tool has its own flags)', () => {
    expect(P('flake', '--workers', '2').rest).toEqual(['--workers', '2']);
  });
});

describe('fallback policy and limits', () => {
  it('parses --pc-fallback; the flag beats TTE_E2E_FALLBACK; bad values throw', () => {
    expect(P('run', '--pc-fallback', 'wait').fallback).toBe('wait');
    expect(() => P('run', '--pc-fallback', 'x')).toThrow(UsageError);
    expect(policyOf(P('run'), {})).toBe('mac');
    expect(policyOf(P('run'), { TTE_E2E_FALLBACK: 'fail' })).toBe('fail');
    expect(policyOf(P('run', '--pc-fallback', 'wait'), { TTE_E2E_FALLBACK: 'fail' })).toBe('wait');
    expect(() => policyOf(P('run'), { TTE_E2E_FALLBACK: 'bogus' })).toThrow(UsageError);
  });
  it('reads the limit env vars', () => {
    expect(limitsOf({})).toMatchObject({ macLoadMax: 14, macLoadWaitSec: 900, pcBusyWaitSec: 600, pcWaitMaxSec: 1800 });
    expect(limitsOf({ TTE_MAC_LOAD_MAX: '8', TTE_PC_BUSY_WAIT_SEC: 'x' })).toMatchObject({ macLoadMax: 8, pcBusyWaitSec: 600 });
  });
});

describe('route table', () => {
  const ALIAS = 'box';
  it('goes remote only with a configured alias', () => {
    expect(route(P('run'), {}, undefined)).toEqual({ where: 'local' });
    expect(route(P('run'), {}, ALIAS)).toEqual({ where: 'remote' });
    expect(route(P('smoke', '--pc'), {}, ALIAS)).toEqual({ where: 'remote' });
  });
  it('--pc without an alias is refused', () => {
    expect(route(P('run', '--pc'), {}, undefined).where).toBe('refuse');
  });
  it('CI, TTE_E2E_LOCAL and --list stay local', () => {
    expect(route(P('run'), { CI: 'true' }, ALIAS)).toEqual({ where: 'local' });
    expect(route(P('run'), { TTE_E2E_LOCAL: '1' }, undefined)).toEqual({ where: 'local' });
    expect(route(P('run', '--', '--list'), {}, ALIAS)).toEqual({ where: 'local' });
  });
  it('--local is refused with a remote unless TTE_ALLOW_MAC_E2E=1; free without one', () => {
    expect(route(P('run', '--local'), {}, ALIAS).where).toBe('refuse');
    expect(route(P('run', '--local'), { TTE_ALLOW_MAC_E2E: '1' }, ALIAS)).toEqual({ where: 'local' });
    expect(route(P('run', '--local'), {}, undefined)).toEqual({ where: 'local' });
  });
  it('TTE_E2E_LOCAL=1 counts as --local when a remote is set', () => {
    expect(route(P('run'), { TTE_E2E_LOCAL: '1' }, ALIAS).where).toBe('refuse');
    expect(route(P('run'), { TTE_E2E_LOCAL: '1', TTE_ALLOW_MAC_E2E: '1' }, ALIAS)).toEqual({ where: 'local' });
  });
  it('attach, cancel, jobs and status need a remote', () => {
    expect(route(P('run', '--pc-status'), {}, ALIAS)).toEqual({ where: 'remote' });
    expect(route(P('run', '--pc-jobs'), {}, undefined).where).toBe('refuse');
  });
});

describe('lane and spec', () => {
  it('picks by test count, repeats included, with overrides', () => {
    expect(pickLane(P('run', 'a.spec.ts'), () => 10)).toBe('short');
    expect(pickLane(P('run', '--repeat-each', '20', 'a.spec.ts'), () => 10)).toBe('full');
    expect(pickLane(P('run'), () => 400)).toBe('full');
    expect(pickLane(P('run'), () => undefined)).toBe('full');
    expect(pickLane(P('run', '--full', 'a'), () => 1)).toBe('full');
    expect(pickLane(P('run', '--pc-lane', 'short'), () => 999)).toBe('short');
  });
  it('the counter gets the filters without repeat flags', () => {
    let seen: readonly string[] = [];
    pickLane(P('smoke', '--repeat-each=3', 'x.spec.ts'), (a) => ((seen = a), 1));
    expect(seen).toEqual(['--grep', '@smoke', 'x.spec.ts']);
    pickLane(P('flake', '--repeat', '5', '--summary-json', 'o.json', 'y.spec.ts'), (a) => ((seen = a), 1));
    expect(seen).toEqual(['y.spec.ts']);
    expect(repeatOf(['--repeat', '5'])).toBe(5);
    expect(repeatOf(['--repeat-each=4'])).toBe(4);
    expect(repeatOf([])).toBe(1);
  });
  it('builds direct playwright commands (pages/itch add their config) and a flake command with its summary fetched back', () => {
    const src = { sha: 'a'.repeat(40), bytes: 0 };
    expect(buildSpec(P('pages', '--grep', 'p'), 'i-1', 'short', src).command).toEqual(['corepack', 'pnpm', 'exec', 'playwright', 'test', '--config', 'playwright.pages.config.ts', '--grep', 'p']);
    const smoke = buildSpec(P('run', '--smoke', '--workers', '2'), 'i-1', 'short', src);
    expect(smoke).toMatchObject({ direct: true, workers: 2, preflight: true });
    expect(smoke.command.slice(-2)).toEqual(['--grep', '@smoke']);
    const fl = buildSpec(P('flake', '--repeat', '3', '--summary-json', 'mine.json', 'z.spec.ts'), 'i-1', 'full', src);
    expect(fl.direct).toBe(false);
    expect(fl.command).toEqual(['corepack', 'pnpm', 'exec', 'tsx', 'tools/ci/e2e-flake.ts', '--repeat', '3', 'z.spec.ts', '--summary-json', '.scratch/pc-flake-summary.json']);
    expect(fl.fetch).toContain('.scratch/pc-flake-summary.json');
  });
  it('renders a job the PC accepts (bash -n shape, no host literals) and ids match the transport id rule', () => {
    const spec = buildSpec(P('run', '--grep', 'a b $x'), newId('short'), 'short', { sha: 'a'.repeat(40), bytes: 0 });
    const { jobSh } = renderJob(spec);
    expect(jobSh).toContain(`'a b $x'`);
    expect(spec.id).toMatch(/^\d{8}-\d{6}-short-[0-9a-f]{6}$/);
    expect(spec.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
  });
});

describe('summary and redaction', () => {
  const report = {
    stats: { expected: 52, unexpected: 1, flaky: 0, skipped: 2, duration: 372_000 },
    suites: [
      {
        suites: [
          {
            specs: [
              { title: 'ok', ok: true, file: 'a.spec.ts', line: 1, tests: [] },
              { title: 'bad one', ok: false, file: 'b.spec.ts', line: 7, tests: [{ results: [{ error: { message: '\u001b[31mExpected 1\u001b[0m\nmore' } }] }] },
            ],
          },
        ],
      },
    ],
  };
  it('summarises counts and failures', () => {
    const s = summarize(report);
    expect(s).toMatchObject({ passed: 52, failed: 1, skipped: 2, durationMs: 372_000 });
    expect(s.failures).toEqual([{ file: 'b.spec.ts', line: 7, title: 'bad one', error: 'Expected 1' }]);
  });
  it('redacts addresses, user@host and home paths', () => {
    const ip = ['10', '1', '2', '3'].join('.');
    const who = ['me', 'box.example'].join('@');
    const home = ['', 'home', 'someone', 'x.log'].join('/');
    const out = redact(`ssh ${who} ${ip} ${home} v1.2.3`);
    expect(out).toBe('ssh <user@host> <addr> ~/x.log v1.2.3');
  });
});

describe('runPc against the fake ssh', () => {
  let root: string;
  let saved: NodeJS.ProcessEnv;
  let remote: Remote;
  beforeEach(() => {
    mkdirSync('.scratch', { recursive: true });
    root = resolve(mkdtempSync(join('.scratch', 'r3-')));
    mkdirSync(join(root, 'home'));
    saved = { ...process.env };
    process.env['HOME'] = join(root, 'home');
    delete process.env['FAKE_SSH_DOWN'];
    remote = { alias: `r3-${String(Math.random()).slice(2)}`, distro: 'Ubuntu', ssh: FAKE };
  });
  afterEach(() => {
    process.env = saved;
    rmSync(root, { recursive: true, force: true });
  });

  const deps = (body: string, out = sink(), err = sink()): Deps => ({
    remote,
    plan: () => ({ sha: 'abcdef0123456789', bytes: 0 }),
    count: () => 3,
    render: () => ({
      jobSh: `#!/bin/bash\necho $$ > pid\nmkdir -p out\n${body}\n`,
      startSh: '#!/bin/bash\ncd "$(dirname "$0")"\nset -m\nbash job.sh >/dev/null 2>&1 </dev/null &\n',
    }),
    out,
    err,
    follow: { caffeinate: false, backoffMs: 20 },
  });
  const okBody = `echo hello > out/output.log\necho '{"stats":{"expected":2,"unexpected":0,"flaky":0,"skipped":0,"duration":1500},"suites":[]}' > out/results.json\necho '{"state":"done","rc":0,"result":"ok","queueSec":4}' > status.json`;

  it('runs, streams, fetches, summarises and copies results.json to PLAYWRIGHT_JSON_OUTPUT_FILE', async () => {
    const out = sink();
    const copy = join(root, 'copy', 'r.json');
    const code = await runPc(P('run', '--pc', 'a.spec.ts'), { PLAYWRIGHT_JSON_OUTPUT_FILE: copy }, root, deps(okBody, out));
    expect(code).toBe(0);
    expect(out.text()).toContain('hello');
    expect(out.text()).toMatch(/PC e2e \d{8}-\d{6}-short-[0-9a-f]{6} abcdef0 short x1: 2 passed, 0 failed, 0 skipped, 2s \(queue 4s\)/);
    expect(readFileSync(copy, 'utf8')).toContain('"expected":2');
    expect(existsSync(join(root, '.scratch', 'remote-e2e'))).toBe(true);
  });

  it('maps the job exit code (1 = failures, 95 = busy) and still reports', async () => {
    const body = `echo busy > out/output.log\necho '{"state":"done","rc":95,"result":"error"}' > status.json\nexit 95`;
    expect(await runPc(P('run', '--pc'), {}, root, deps(body))).toBe(95);
    const fail = `echo x > out/output.log\necho '{"state":"done","rc":1,"result":"fail"}' > status.json\nexit 1`;
    expect(await runPc(P('run', '--pc'), {}, root, deps(fail))).toBe(1);
  });

  it('a vanished job is exit 93', async () => {
    expect(await runPc(P('run', '--pc'), {}, root, deps('exit 0'))).toBe(93);
  });

  it('unreachable PC is exit 94 before anything is built', async () => {
    process.env['FAKE_SSH_DOWN'] = '1';
    await expect(runPc(P('run', '--pc'), {}, root, deps(okBody))).rejects.toMatchObject({ code: 94 });
    expect(existsSync(join(root, '.scratch'))).toBe(false);
  });

  it('--pc-detach returns right after submit with the attach hint; attach then follows', async () => {
    const out = sink();
    expect(await runPc(P('run', '--pc', '--pc-detach'), {}, root, deps(`sleep 0.3\n${okBody}`, out))).toBe(0);
    const id = /--pc-attach (\S+)/.exec(out.text())?.[1] ?? '';
    expect(id).toMatch(/-short-/);
    const out2 = sink();
    expect(await runPc(P('run', `--pc-attach`, id), {}, root, deps('', out2))).toBe(0);
    expect(out2.text()).toContain('hello');
  });

  it('aborting cancels the PC job and returns 130', async () => {
    const out = sink();
    const ctl = new AbortController();
    const d = deps(`echo started > out/output.log\nsleep 30`, out);
    setTimeout(() => { ctl.abort(); }, 1500);
    expect(await runPc(P('run', '--pc'), {}, root, d, ctl.signal)).toBe(130);
    const st = readFileSync(join(root, 'home', 'tte-offload', 'jobs', readdirIds(root)[0] ?? '', 'status.json'), 'utf8');
    expect(st).toContain('cancelled');
  });

  it('refuses headed runs', async () => {
    await expect(runPc(P('run', '--pc', '--', '--headed'), {}, root, deps(okBody))).rejects.toThrow(/headless/);
  });

  it('prints the host summary for --pc-status without a job', async () => {
    const out = sink();
    writeFileSync(join(root, 'x'), '');
    expect(await runPc(P('run', '--pc-status'), {}, root, deps('', out))).toBe(0);
    expect(out.text()).toContain('lane short');
  });

  describe('runRouted (decide loop)', () => {
    const UP: PcView = { state: 'up', lanes: { short: 'idle', full: 'idle' }, gpuJobs: 0, young: false };
    const BUSY: PcView = { state: 'busy', why: 'load', lanes: { short: 'busy', full: 'busy' }, gpuJobs: 0, young: false };
    const DOWN: PcView = { state: 'down', why: 'unreachable' };
    interface Fake extends Io {
      views: PcView[];
      noted: number[];
      macRuns: string[];
      slept: number[];
      load: number;
      macExit: number[];
    }
    const fakeIo = (views: PcView[], macExit: number[] = [0]): Fake => {
      const f: Fake = {
        views: [...views],
        noted: [],
        macRuns: [],
        slept: [],
        load: 1,
        macExit: [...macExit],
        probe: () => Promise.resolve(f.views.length > 1 ? (f.views.shift() as PcView) : (f.views[0] as PcView)),
        noteExit: (c) => void f.noted.push(c),
        macLoad: () => f.load,
        sleep: (sec) => {
          f.slept.push(sec);
          return Promise.resolve();
        },
        local: (_p, reason) => {
          f.macRuns.push(reason);
          return Promise.resolve(f.macExit.shift() ?? 0);
        },
      };
      return f;
    };
    const failBody = (rc: number): string => `echo x > out/output.log\necho '{"state":"done","rc":${String(rc)},"result":"fail"}' > status.json\nexit ${String(rc)}`;
    const ranOn = (e: ReturnType<typeof sink>): string => /e2e ran on: (.*)/.exec(e.text())?.[1] ?? '';

    it('PC up and green: runs on the PC, never the Mac, final line names the job', async () => {
      const io = fakeIo([UP]);
      const err = sink();
      expect(await runRouted(P('smoke'), {}, root, deps(okBody, sink(), err), io)).toBe(0);
      expect(io.macRuns).toEqual([]);
      expect(io.noted).toEqual([0]);
      expect(ranOn(err)).toMatch(/^PC \(job \d{8}-\d{6}-short-[0-9a-f]{6}, short lane\) -> exit 0$/);
    });

    it('never the Mac after PC exit 1 (failing tests are a result)', async () => {
      const io = fakeIo([UP]);
      expect(await runRouted(P('run'), {}, root, deps(failBody(1)), io)).toBe(1);
      expect(io.macRuns).toEqual([]);
    });

    it('PC down: a short run falls back to the Mac without touching ssh', async () => {
      const calls = join(root, 'calls');
      process.env['FAKE_SSH_CALLS'] = calls;
      const io = fakeIo([DOWN], [0]);
      const err = sink();
      expect(await runRouted(P('smoke'), {}, root, deps(okBody, sink(), err), io)).toBe(0);
      expect(io.macRuns).toHaveLength(1);
      expect(io.macRuns[0]).toContain('PC down');
      expect(existsSync(calls)).toBe(false);
      expect(ranOn(err)).toMatch(/^Mac \(fallback: PC down/);
    });

    it('PC down: --pc, --pc-detach, --full and fallback=fail never reach the Mac (exit 94)', async () => {
      for (const args of [['run', '--pc'], ['run', '--pc', '--pc-detach'], ['run', '--full'], ['run', '--pc-fallback', 'fail']]) {
        const io = fakeIo([DOWN]);
        expect(await runRouted(P(...args), {}, root, deps(okBody), io)).toBe(94);
        expect(io.macRuns).toEqual([]);
      }
      const io = fakeIo([DOWN]);
      expect(await runRouted(P('run'), { TTE_E2E_FALLBACK: 'fail' }, root, deps(okBody), io)).toBe(94);
      expect(io.macRuns).toEqual([]);
    });

    it('TTE_ALLOW_MAC_E2E=1 lifts the short-only limit', async () => {
      const io = fakeIo([DOWN]);
      expect(await runRouted(P('run', '--full'), { TTE_ALLOW_MAC_E2E: '1' }, root, deps(okBody), io)).toBe(0);
      expect(io.macRuns).toHaveLength(1);
    });

    const busyDeps = (waits: (number | undefined)[]): Deps => {
      const d = deps(`echo busy > out/output.log\necho '{"state":"done","rc":95,"result":"error"}' > status.json\nexit 95`);
      const render = d.render;
      d.render = (spec) => {
        waits.push(spec.waitSec);
        return render(spec);
      };
      return d;
    };

    it('PC lock busy (exit 95): falls back to the Mac; the job waited only the busy cap for the lock', async () => {
      const waits: (number | undefined)[] = [];
      const io = fakeIo([UP], [0]);
      expect(await runRouted(P('run'), {}, root, busyDeps(waits), io)).toBe(0);
      expect(waits).toEqual([600]);
      expect(io.noted).toEqual([95]);
      expect(io.macRuns[0]).toContain('exit 95');
    });

    it('a run that cannot fall back keeps the lane wait and reports 95', async () => {
      const waits: (number | undefined)[] = [];
      const io = fakeIo([UP]);
      expect(await runRouted(P('run', '--pc'), {}, root, busyDeps(waits), io)).toBe(95);
      expect(waits).toEqual([undefined]);
      expect(io.macRuns).toEqual([]);
    });

    it('unreachable at submit (exit 94 after an up probe) falls back to the Mac', async () => {
      process.env['FAKE_SSH_DOWN'] = '1';
      const io = fakeIo([UP, DOWN], [0]);
      expect(await runRouted(P('run'), {}, root, deps(okBody), io)).toBe(0);
      expect(io.noted).toEqual([94]);
      expect(io.macRuns).toHaveLength(1);
    });

    it('a lost job (93) is retried once on the PC, then goes to the Mac', async () => {
      const io = fakeIo([UP], [0]);
      expect(await runRouted(P('run'), {}, root, deps('exit 0'), io)).toBe(0);
      expect(io.noted).toEqual([93, 93]);
      expect(io.macRuns).toHaveLength(1);
    });

    it('busy PC: waits, then runs on the PC once it is up', async () => {
      const io = fakeIo([BUSY, UP]);
      expect(await runRouted(P('run'), {}, root, deps(okBody), io)).toBe(0);
      expect(io.slept).toEqual([30]);
      expect(io.macRuns).toEqual([]);
    });

    const rcBody = (rc: number): string => `echo x > out/output.log\necho '{"state":"done","rc":${String(rc)}}' > status.json\nexit ${String(rc)}`;

    it('a job that died of memory (rc 93, state done) is final: exit 93, no Mac run', async () => {
      const io = fakeIo([UP], [0]);
      expect(await runRouted(P('run'), {}, root, deps(rcBody(93)), io)).toBe(93);
      expect(io.noted).toEqual([93]);
      expect(io.macRuns).toEqual([]);
    });

    it('frames stall (96) goes to the Mac', async () => {
      const io = fakeIo([UP], [0]);
      expect(await runRouted(P('run'), {}, root, deps(rcBody(96)), io)).toBe(0);
      expect(io.noted).toEqual([96]);
      expect(io.macRuns[0]).toContain('frames');
    });

    it('a failed result fetch (exit 3) is final', async () => {
      const io = fakeIo([UP], [0]);
      const body = `${okBody}\nrm -rf out\necho x > out`;
      expect(await runRouted(P('run'), {}, root, deps(body), io)).toBe(3);
      expect(io.noted).toEqual([3]);
      expect(io.macRuns).toEqual([]);
    });

    it('ssh given up (255) reattaches once to the same job and submits nothing new', async () => {
      // Wrapper: the first two follow calls fail with 255 (budget 0 then gives up), later ones pass through.
      const count = join(root, 'follows');
      const wrap = join(root, 'ssh-wrap.sh');
      writeFileSync(wrap, `#!/bin/bash\nif [[ " $* " == *" follow "* ]]; then echo f >> '${count}'; if [ "$(wc -l < '${count}')" -le 2 ]; then exit 255; fi; fi\nexec '${FAKE}' "$@"\n`, { mode: 0o755 });
      remote.ssh = wrap;
      const waits: (number | undefined)[] = [];
      const d = busyDeps(waits);
      d.render = ((r) => (waits.push(0), deps(okBody).render(r)));
      d.follow = { caffeinate: false, backoffMs: 20, budgetMs: 0 };
      const io = fakeIo([UP], [0]);
      const err = sink();
      d.err = err;
      expect(await runRouted(P('run'), {}, root, d, io)).toBe(0);
      expect(waits).toHaveLength(1);
      expect(io.noted).toEqual([255, 0]);
      expect(io.macRuns).toEqual([]);
      const ids = [...err.text().matchAll(/PC job (\S+) /g)].map((m) => m[1]);
      expect(ids).toHaveLength(1);
      expect(readdirIds(root)).toEqual(ids);
    });

    it('--pc with a busy probe submits at once (no lane wait override)', async () => {
      const waits: (number | undefined)[] = [];
      const io = fakeIo([BUSY]);
      expect(await runRouted(P('run', '--pc'), {}, root, busyDeps(waits), io)).toBe(95);
      expect(waits).toEqual([undefined]);
      expect(io.slept).toEqual([]);
    });

    it('Ctrl-C while waiting returns 130 with no job and no Mac run', async () => {
      const io = fakeIo([BUSY]);
      const ctl = new AbortController();
      io.sleep = (sec) => {
        io.slept.push(sec);
        ctl.abort();
        return Promise.resolve();
      };
      expect(await runRouted(P('run'), {}, root, deps(okBody), io, ctl.signal)).toBe(130);
      expect(io.slept).toEqual([30]);
      expect(io.macRuns).toEqual([]);
      expect(io.noted).toEqual([]);
    });

    it('PC down and the Mac overloaded: waits, then gives up with exit 89', async () => {
      const io = fakeIo([DOWN]);
      io.load = 30;
      const err = sink();
      expect(await runRouted(P('run'), { TTE_MAC_LOAD_WAIT_SEC: '240' }, root, deps(okBody, sink(), err), io)).toBe(89);
      expect(io.slept.reduce((a, b) => a + b, 0)).toBe(240);
      expect(io.macRuns).toEqual([]);
      expect(err.text()).toMatch(/no runner/);
    });

    it('Mac exit 75 (no browser slot) goes back to the PC when it is up', async () => {
      const io = fakeIo([DOWN, UP], [75]);
      expect(await runRouted(P('run'), {}, root, deps(okBody), io)).toBe(0);
      expect(io.macRuns).toHaveLength(1);
      expect(io.noted).toEqual([0]);
    });

    it('the Mac result is final (a red Mac run is not rerun on the PC)', async () => {
      const io = fakeIo([DOWN, UP], [1]);
      expect(await runRouted(P('run'), {}, root, deps(okBody), io)).toBe(1);
      expect(io.noted).toEqual([]);
    });

    describe('queue path (TTE_E2E_VIA_QUEUE=1)', () => {
      const ENV = { TTE_E2E_VIA_QUEUE: '1', TTE_JOBS_TOKEN: 'tok-secret-1234' };
      interface FQ extends QueueClient {
        submits: string[];
        cancels: string[];
      }
      const fakeQueue = (o: { caps?: boolean; rc?: number; waitThrows?: number; fetchFails?: boolean } = {}): FQ => {
        const q: FQ = {
          submits: [],
          cancels: [],
          caps: () => Promise.resolve(o.caps ?? true),
          submitRaw: (lane, id) => {
            q.submits.push(`${lane}:${id}`);
            return Promise.resolve(`raw-${id}`);
          },
          waitRaw: () => (o.waitThrows ? Promise.reject(new CtlError('PC unreachable (ssh failed)', o.waitThrows)) : Promise.resolve(o.rc ?? 0)),
          fetchRaw: (_id, dest) => {
            if (o.fetchFails) return Promise.reject(new CtlError('could not unpack the results', 1));
            mkdirSync(dest, { recursive: true });
            writeFileSync(join(dest, 'results.json'), '{"stats":{"expected":5,"unexpected":0,"flaky":0,"skipped":0,"duration":2000},"suites":[]}');
            writeFileSync(join(dest, 'status.json'), `{"state":"done","rc":${String(o.rc ?? 0)},"queueSec":3}`);
            return Promise.resolve();
          },
          cancelRaw: (id) => {
            q.cancels.push(id);
            return Promise.resolve();
          },
        };
        return q;
      };
      const run = async (args: string[], q: FQ, env: Record<string, string> = ENV, d0: Partial<Deps> = {}) => {
        const io = fakeIo([UP]);
        const err = sink();
        const out = sink();
        const code = await runRouted(P(...args), env, root, { ...deps(okBody, out, err), queue: q, ...d0 }, io);
        return { code, io, err, out };
      };

      it('flag off with --full: the old path, the queue is never touched', async () => {
        const q = fakeQueue();
        const { code, io } = await run(['run', '--full'], q, {});
        expect(code).toBe(0);
        expect(q.submits).toEqual([]);
        expect(io.noted).toEqual([0]);
      });

      it('flag on but a short run: the old path', async () => {
        const q = fakeQueue();
        const { code, io } = await run(['run', 'a.spec.ts'], q);
        expect(code).toBe(0);
        expect(q.submits).toEqual([]);
        expect(io.noted).toEqual([0]);
      });

      it('flag on, full run: one cpu-full submit, no probe, no Mac, grep-able last line, report printed', async () => {
        const q = fakeQueue();
        let probes = 0;
        const io = fakeIo([UP]);
        io.probe = () => {
          probes++;
          return Promise.resolve(UP);
        };
        const err = sink();
        const out = sink();
        expect(await runRouted(P('run', '--full'), ENV, root, { ...deps(okBody, out, err), queue: q }, io)).toBe(0);
        expect(q.submits).toHaveLength(1);
        expect(q.submits[0]).toMatch(/^cpu-full:\d{8}-\d{6}-full-[0-9a-f]{6}$/);
        expect(probes).toBe(0);
        expect(io.macRuns).toEqual([]);
        expect(ranOn(err)).toMatch(/^PC \(queue job raw-\d{8}-\d{6}-full-[0-9a-f]{6}, full lane\) -> exit 0$/);
        expect(out.text()).toMatch(/5 passed, 0 failed, 0 skipped, 2s \(queue 3s\)/);
        expect(`${out.text()}${err.text()}`).not.toContain('tok-secret');
      });

      it('a count over 150 tests picks the full lane and the queue', async () => {
        const q = fakeQueue();
        await run(['run'], q, ENV, { count: () => 200 });
        expect(q.submits).toHaveLength(1);
      });

      it.each([1, 92, 95, 96, 98, 99, 124, 143, 93])('job rc %i is final: one submit, never the Mac (even with TTE_ALLOW_MAC_E2E=1)', async (rc) => {
        const q = fakeQueue({ rc });
        const { code, io } = await run(['run', '--full'], q, { ...ENV, TTE_ALLOW_MAC_E2E: '1' });
        expect(code).toBe(rc);
        expect(q.submits).toHaveLength(1);
        expect(io.macRuns).toEqual([]);
      });

      it('wait failing with ssh down gives 94 and no Mac run', async () => {
        const q = fakeQueue({ waitThrows: 94 });
        const { code, io } = await run(['run', '--full'], q);
        expect(code).toBe(94);
        expect(q.submits).toHaveLength(1);
        expect(io.macRuns).toEqual([]);
      });

      it('failures before anything runs: 94 caps ssh failure, 97 no token, 2 over the cap; no Mac, no submit', async () => {
        const bundle = (_c: string, _i: string, o: { outDir: string }): { sha: string; bytes: number } => {
          writeFileSync(join(o.outDir, 'src.bundle'), Buffer.alloc(2 * 1048576));
          return { sha: 'abcdef0123456789', bytes: 0 };
        };
        const cases: [Record<string, string>, FQ, Partial<Deps>, number][] = [
          [ENV, fakeQueue({ caps: false }), {}, 94],
          [{ TTE_E2E_VIA_QUEUE: '1', TTE_JOBS_CONFIG_DIR: join(root, 'no-config') }, fakeQueue(), {}, 97],
          [ENV, fakeQueue(), { rawCapMb: 1, plan: bundle }, 2],
        ];
        for (const [env, q, d0, want] of cases) {
          const { code, io } = await run(['run', '--full'], q, { ...env, TTE_ALLOW_MAC_E2E: '1' }, d0);
          expect(code).toBe(want);
          expect(q.submits).toEqual([]);
          expect(io.macRuns).toEqual([]);
        }
      });

      it('fetch failure: after rc 0 it is 3, after rc 1 the rc stands', async () => {
        expect((await run(['run', '--full'], fakeQueue({ fetchFails: true, rc: 0 }))).code).toBe(3);
        expect((await run(['run', '--full'], fakeQueue({ fetchFails: true, rc: 1 }))).code).toBe(1);
      });

      it('abort cancels the raw job once and returns 130', async () => {
        const q = fakeQueue();
        q.waitRaw = () => new Promise<number>(() => undefined);
        const ctl = new AbortController();
        const err = sink();
        const pr = runRouted(P('run', '--full'), ENV, root, { ...deps(okBody, sink(), err), queue: q }, fakeIo([UP]), ctl.signal);
        await new Promise((r) => setTimeout(r, 200));
        ctl.abort();
        expect(await pr).toBe(130);
        expect(q.cancels).toEqual([expect.stringMatching(/^raw-\d{8}-\d{6}-full-/)]);
      });

      it('abort with a failing cancel prints the --pc-cancel hint and still gives 130', async () => {
        const q = fakeQueue();
        q.waitRaw = () => new Promise<number>(() => undefined);
        q.cancelRaw = () => Promise.reject(new CtlError('nope', 77));
        const ctl = new AbortController();
        const err = sink();
        const pr = runRouted(P('run', '--full'), ENV, root, { ...deps(okBody, sink(), err), queue: q }, fakeIo([UP]), ctl.signal);
        await new Promise((r) => setTimeout(r, 200));
        ctl.abort();
        expect(await pr).toBe(130);
        expect(err.text()).toMatch(/--pc-cancel raw-\d{8}-\d{6}-full-/);
      });

      it('--pc-detach prints the hint and returns 0 without waiting', async () => {
        const q = fakeQueue();
        let waited = false;
        q.waitRaw = () => {
          waited = true;
          return Promise.resolve(0);
        };
        const { code, out } = await run(['run', '--full', '--pc-detach'], q);
        expect(code).toBe(0);
        expect(waited).toBe(false);
        expect(q.submits).toHaveLength(1);
        expect(out.text()).toMatch(/detached: .*--pc-attach raw-\d{8}-\d{6}-full-[0-9a-f]{6} \| --pc-cancel raw-/);
      });

      it('--pc-attach raw-<id> waits for and fetches that id; --pc-cancel raw-<id> cancels it', async () => {
        const q = fakeQueue({ rc: 1 });
        const fetched: string[] = [];
        const f = q.fetchRaw.bind(q);
        q.fetchRaw = (id, dest) => {
          fetched.push(id);
          return f(id, dest);
        };
        const out = sink();
        const err = sink();
        const d = { ...deps(okBody, out, err), queue: q };
        expect(await runPc(P('run', '--pc-attach', 'raw-20261119-101010-full-abc123'), ENV, root, d)).toBe(1);
        expect(fetched).toEqual(['raw-20261119-101010-full-abc123']);
        expect(await runPc(P('run', '--pc-cancel', 'raw-20261119-101010-full-abc123'), ENV, root, d)).toBe(0);
        expect(q.cancels).toEqual(['raw-20261119-101010-full-abc123']);
        expect(`${out.text()}${err.text()}`).not.toContain('tok-secret');
      });

      it('--headed with the flag is a usage error before any queue call', async () => {
        const q = fakeQueue();
        const { code } = await run(['run', '--full', '--', '--headed'], q);
        expect(code).toBe(2);
        expect(q.submits).toEqual([]);
      });
    });
  });
});

function readdirIds(root: string): string[] {
  return readdirSync(join(root, 'home', 'tte-offload', 'jobs'));
}

describe('serverTrouble', () => {
  const log = [
    '2026-11-18T10:00:00.000Z [port 1 sup 2] start: mode test',
    '2026-11-18T10:00:05.000Z [port 1 sup 2] preview EXITED unexpectedly after 3.0 s: exit 143',
    '2026-11-18T10:00:06.000Z [port 1 sup 2] preview started pid=9',
    '2026-11-18T10:01:00.000Z [port 1 sup 2] gave up: 20 fast failures in a row',
    'continuation line that mentions EXITED',
  ].join('\n');

  it('keeps only trouble lines at or after the run start', () => {
    expect(serverTrouble(log, '')).toHaveLength(2);
    expect(serverTrouble(log, '2026-11-18T10:00:30.000Z')).toEqual([expect.stringContaining('gave up')]);
    expect(serverTrouble('', '')).toEqual([]);
  });

  it('caps at 10 lines', () => {
    const many = Array.from({ length: 30 }, (_, i) => `2026-11-18T10:00:${String(i).padStart(2, '0')}.000Z [port 1 sup 2] preview EXITED`).join('\n');
    expect(serverTrouble(many, '')).toHaveLength(10);
  });
});
