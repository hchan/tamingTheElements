import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSpec, newId, parseArgs, pickLane, redact, repeatOf, route, runPc, summarize, UsageError, type Deps, type Parsed } from '../../tools/ci/e2e-route';
import { renderJob } from '../../tools/ci/pc-job';
import type { Remote } from '../../tools/ci/pc-remote';

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
    expect(route(P('run'), { TTE_E2E_LOCAL: '1' }, ALIAS)).toEqual({ where: 'local' });
    expect(route(P('run', '--', '--list'), {}, ALIAS)).toEqual({ where: 'local' });
  });
  it('--local is refused with a remote unless TTE_ALLOW_MAC_E2E=1; free without one', () => {
    expect(route(P('run', '--local'), {}, ALIAS).where).toBe('refuse');
    expect(route(P('run', '--local'), { TTE_ALLOW_MAC_E2E: '1' }, ALIAS)).toEqual({ where: 'local' });
    expect(route(P('run', '--local'), {}, undefined)).toEqual({ where: 'local' });
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
});

function readdirIds(root: string): string[] {
  return readdirSync(join(root, 'home', 'tte-offload', 'jobs'));
}
