import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CtlError, ownerId, parseArgs, run, UsageError } from '../../tools/gpu-queue/jobs';

// End to end through the real ctl.py: fake ssh runs the remote command locally in a temp HOME, fake pueue/nvidia-smi stand in for the PC.
const FAKE_SSH = resolve('tests/repo/fixtures/fake-ssh.sh');
const TD = resolve('tools/gpu-queue/testdata');
const FAKE_GQ = 'import sys\nif "--dry-run" in sys.argv:\n    print("eta 1h")\nsys.exit(0)\n';
let root: string;
let home: string;
let saved: NodeJS.ProcessEnv;
let n = 0;

const sink = (): { write(c: Buffer | string): boolean; text(): string } => {
  const chunks: Buffer[] = [];
  return { write: (c) => (chunks.push(Buffer.from(c)), true), text: () => Buffer.concat(chunks).toString('utf8') };
};
const gpu = async (args: string[], extra: Record<string, string> = {}): Promise<{ code: number; out: string; err: string }> => {
  const out = sink();
  const err = sink();
  const before = { ...process.env };
  Object.assign(process.env, extra); // spawned ssh inherits process.env, so the knobs must live there
  const env = process.env;
  try {
    const code = await run(args, env, process.cwd(), out as never, err as never);
    return { code, out: out.text(), err: err.text() };
  } catch (e) {
    return { code: e instanceof CtlError ? e.code : 2, out: out.text(), err: `${err.text()}${(e as Error).message}` };
  } finally {
    process.env = before;
  }
};
const queueFile = (name = 'q.json', bulk = false): string => {
  const p = join(root, name);
  writeFileSync(p, JSON.stringify({ jobs: [{ bulk }] }));
  return p;
};
const jobsDir = (): string => join(home, 'tte-jobs', 'jobs');
const onlyJob = (): string => readdirSync(jobsDir())[0] as string;

beforeEach(() => {
  mkdirSync('.scratch', { recursive: true });
  root = resolve(mkdtempSync(join('.scratch', 'gjc-')));
  home = join(root, 'home');
  const bin = join(root, 'bin');
  mkdirSync(home);
  mkdirSync(bin);
  for (const [from, to] of [['fake_pueue.py', 'pueue'], ['fake_pueued.py', 'pueued']] as const) {
    copyFileSync(join(TD, from), join(bin, to));
    chmodSync(join(bin, to), 0o755);
  }
  saved = { ...process.env };
  Object.assign(process.env, {
    HOME: home,
    TTE_SSH: FAKE_SSH,
    TTE_REMOTE: `fake-gjc-${String(n++)}`,
    TTE_JOBS_OWNER: 'agent-a',
    TTE_JOBS_CONFIG_DIR: join(root, 'cfg'),
    TTE_JOBS_PUEUE: join(bin, 'pueue'),
    TTE_JOBS_PUEUED: join(bin, 'pueued'),
    FAKE_PUEUE_STATE: join(root, 'pueue-state.json'),
    TTE_JOBS_NVSMI: join(TD, 'fake_nvidia_smi.sh'),
    TTE_JOBS_NO_WATCHDOG: '1',
    TTE_JOBS_FAKE_FREE_GB: '100',
    TTE_JOBS_PY: 'python3',
    TTE_JOBS_NOW: '2026-11-18T12:00:00',
    TTE_JOBS_POLL_MS: '20',
    FAKE_SSH_LOG: join(root, 'ssh.log'),
  });
  delete process.env['TTE_JOBS_TOKEN'];
  delete process.env['TTE_JOBS_ADMIN_TOKEN'];
  delete process.env['FAKE_SSH_DOWN'];
});
afterEach(() => {
  process.env = saved;
  rmSync(root, { recursive: true, force: true });
});

const setup = async (): Promise<string> => {
  const r = await gpu(['setup']);
  expect(r.code, r.err + r.out).toBe(0);
  // The real gpu-queue.py needs a GPU venv; swap in a fake that only answers --dry-run.
  writeFileSync(join(home, 'tte-jobs', 'bin', 'gpu-queue.py'), FAKE_GQ);
  return /ADMIN TOKEN[^:]*: (\w+)/.exec(r.out)?.[1] ?? '';
};

describe('pure helpers', () => {
  it('parses flags and rejects unknown ones', () => {
    const f = parseArgs(['q.json', '--with', 'a', '--with', 'b', '--now', '--json']);
    expect(f).toMatchObject({ pos: ['q.json'], with: ['a', 'b'], now: true, json: true });
    expect(() => parseArgs(['--bogus'])).toThrow(UsageError);
    expect(() => parseArgs(['--with'])).toThrow(UsageError);
  });
  it('owner id: env override, derived form, and rejection of bad ids', () => {
    expect(ownerId({ TTE_JOBS_OWNER: 'abc_1' }, '.')).toBe('abc_1');
    expect(() => ownerId({ TTE_JOBS_OWNER: 'a b' }, '.')).toThrow(UsageError);
    expect(ownerId({}, process.cwd())).toMatch(/^[A-Za-z0-9_-]+-[0-9a-f]{8}$/);
  });
});

describe('gpu CLI against the fake PC', () => {
  it('setup uploads, saves the user token, prints the admin token once, and is idempotent', async () => {
    const adm = await setup();
    expect(adm).toMatch(/^[0-9a-f]{32}$/);
    expect(existsSync(join(home, 'tte-jobs', 'bin', 'ctl.py'))).toBe(true);
    const tok = readFileSync(join(root, 'cfg', 'token'), 'utf8').trim();
    expect(tok).toMatch(/^[0-9a-f]{32}$/);
    expect(tok).not.toBe(adm);
    const again = await gpu(['setup']);
    expect(again.code).toBe(0);
    expect(again.out).not.toContain('ADMIN TOKEN');
    expect(readFileSync(join(root, 'cfg', 'token'), 'utf8').trim()).toBe(tok);
  });

  it('setup on a second machine without a token refuses (77) instead of rotating', async () => {
    await setup();
    rmSync(join(root, 'cfg'), { recursive: true });
    expect((await gpu(['setup'])).code).toBe(77);
  });

  it('refuses to run without a token or without a configured PC', async () => {
    expect((await gpu(['status'])).code).toBe(2);
    const r = await gpu(['status'], { TTE_REMOTE: '', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' });
    expect(r.code).toBe(2);
  });

  it('submit -> list -> status -> cancel, with ownership', async () => {
    await setup();
    const s = await gpu(['submit', queueFile()]);
    expect(s.code, s.err).toBe(0);
    expect(s.out).toMatch(/^queued g-\d{14}-[0-9a-f]{4}: place 1 \(0 ahead\), start now/);
    const id = onlyJob();
    expect((await gpu(['list'])).out).toContain(id);
    expect((await gpu(['list'], { TTE_JOBS_OWNER: 'agent-b' })).out).toBe('no jobs\n');
    expect((await gpu(['list', '--all'], { TTE_JOBS_OWNER: 'agent-b' })).out).toContain(id);
    const st = await gpu(['status']);
    expect(st.out).toMatch(/gpu 50 C .*disk 100 GB free, art window closed, gpu 0 running 1 queued/);
    expect((await gpu(['cancel', id], { TTE_JOBS_OWNER: 'agent-b' })).code).toBe(77);
    expect((await gpu(['cancel', id, '--force'])).code).toBe(77);
    const c = await gpu(['cancel', id]);
    expect([c.code, c.out]).toEqual([0, `${id}: cancelled\n`]);
  });

  it('--now and admin verbs need the admin token', async () => {
    const adm = await setup();
    expect((await gpu(['submit', queueFile(), '--now'])).code).toBe(77);
    expect((await gpu(['admin', 'pause'])).code).toBe(77);
    const ok = await gpu(['submit', queueFile('b.json', true), '--now', '--json'], { TTE_JOBS_ADMIN_TOKEN: adm });
    expect(ok.code, ok.err).toBe(0);
    expect(JSON.parse(ok.out)).toMatchObject({ start: 'now', proto: 1 });
    expect((await gpu(['admin', 'pause'], { TTE_JOBS_ADMIN_TOKEN: adm })).out).toContain('pause');
    expect((await gpu(['admin', 'resume'], { TTE_JOBS_ADMIN_TOKEN: adm })).code).toBe(0);
  });

  it('a bulk job outside the art window is delayed to 23:00', async () => {
    await setup();
    expect((await gpu(['submit', queueFile('b.json', true)])).out).toContain('start 2026-11-18 23:00:00');
  });

  it('invalid queue exits 6, bad ids exit 2', async () => {
    await setup();
    writeFileSync(join(home, 'tte-jobs', 'bin', 'gpu-queue.py'), 'import sys\nsys.exit(6)\n');
    expect((await gpu(['submit', queueFile()])).code).toBe(6);
    expect((await gpu(['cancel', 'bad id!'])).code).toBe(2);
    expect((await gpu(['submit', join(root, 'nope.json')])).code).toBe(2);
  });

  it('disk under 10 GB refuses with 97', async () => {
    await setup();
    expect((await gpu(['submit', queueFile()], { TTE_JOBS_FAKE_FREE_GB: '9' })).code).toBe(97);
  });

  it('wait streams the log and maps the final state to an exit code; fetch unpacks results', async () => {
    await setup();
    await gpu(['submit', queueFile()]);
    const id = onlyJob();
    const jd = join(jobsDir(), id);
    const meta = JSON.parse(readFileSync(join(jd, 'meta.json'), 'utf8')) as Record<string, unknown>;
    mkdirSync(join(jd, 'work', 'out'), { recursive: true });
    writeFileSync(join(jd, 'work', 'progress.log'), 'step 1\nstep 2\n');
    writeFileSync(join(jd, 'work', 'out', 'a.txt'), 'result');
    writeFileSync(join(jd, 'meta.json'), JSON.stringify({ ...meta, state: 'done', rc: 0 }));
    // ctl.list reconciles against pueue: mark the task done there too so the registry state sticks.
    const st = JSON.parse(readFileSync(join(root, 'pueue-state.json'), 'utf8')) as { tasks: Record<string, { status: unknown }> };
    const task = st.tasks[String(meta['tid'])];
    if (task) task.status = { Done: 'Success' };
    writeFileSync(join(root, 'pueue-state.json'), JSON.stringify(st));
    const w = await gpu(['wait', id]);
    expect([w.code, w.out]).toEqual([0, 'step 1\nstep 2\n']);
    const dest = join(root, 'got');
    const f = await gpu(['fetch', id, dest]);
    expect(f.code, f.err).toBe(0);
    expect(readFileSync(join(dest, 'out', 'a.txt'), 'utf8')).toBe('result');
    writeFileSync(join(jd, 'meta.json'), JSON.stringify({ ...meta, state: 'failed', rc: 1 }));
    expect((await gpu(['wait', id])).code).toBe(1);
  });

  it('an unreachable PC exits 94 and never prints the alias', async () => {
    await setup();
    const alias = process.env['TTE_REMOTE'] as string;
    const r = await gpu(['status'], { FAKE_SSH_DOWN: '1' });
    expect(r.code).toBe(94);
    expect(r.out + r.err).not.toContain(alias);
  });

  it('sends the token on stdin, never in the command line', async () => {
    await setup();
    await gpu(['status']);
    const tok = readFileSync(join(root, 'cfg', 'token'), 'utf8').trim();
    expect(readFileSync(join(root, 'ssh.log'), 'utf8')).not.toContain(tok);
  });
});
