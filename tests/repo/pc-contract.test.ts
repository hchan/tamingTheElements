import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JOB_ID_RE, renderJob, type JobSpec } from '../../tools/ci/pc-job';
import { fetchResults, follow, ID_RE, jobStatus, submit, type Remote } from '../../tools/ci/pc-remote';
import { planSource } from '../../tools/ci/pc-snapshot';

/**
 * Contract between the renderer (pc-job) and the transport (pc-remote): the files pc-remote reads (pid, status.json,
 * out/output.log, out/) must exist with the shapes it parses. The real job.sh needs flock/setsid/git/pnpm, so only its
 * prologue (up to the queue step) is run, with the macOS-missing setsid and the group kill neutralised.
 */
const FAKE = resolve('tests/repo/fixtures/fake-ssh.sh');
let root: string;
let home: string;
let saved: NodeJS.ProcessEnv;
let n = 0;
let remote: Remote;

beforeEach(() => {
  mkdirSync('.scratch', { recursive: true });
  root = resolve(mkdtempSync(join('.scratch', 'pcc-')));
  home = join(root, 'home');
  mkdirSync(home);
  saved = { ...process.env };
  process.env['HOME'] = home;
  delete process.env['FAKE_SSH_DOWN'];
  delete process.env['FAKE_PID1_AGE'];
  remote = { alias: `contract-${String(n++)}`, distro: 'Ubuntu', ssh: FAKE };
});
afterEach(() => {
  process.env = saved;
  rmSync(root, { recursive: true, force: true });
});

const sink = (): { write(c: Buffer | string): void; text(): string } => {
  const chunks: Buffer[] = [];
  return { write: (c) => void chunks.push(Buffer.from(c)), text: () => Buffer.concat(chunks).toString('utf8') };
};
const quiet = { err: sink(), caffeinate: false, backoffMs: 20 };

function jobDir(id: string): string {
  const spec: JobSpec = { id, lane: 'short', source: { sha: 'a'.repeat(40) }, command: ['true'], env: {}, fetch: [], preflight: false };
  const { jobSh, startSh } = renderJob(spec);
  const cut = jobSh.indexOf('# 1. Queue');
  expect(cut).toBeGreaterThan(0);
  const prologue = jobSh
    .slice(0, cut)
    .replace(/^\[ "\$\{TTE_JOB_LEADER:-\}" = 1 \] \|\| exec .*$/m, ':') // no setsid on macOS
    .replace('kill -TERM -- "-$PGID" 2>/dev/null', ':'); // do not signal the test runner's group
  expect(prologue).not.toContain('setsid');
  expect(prologue).not.toMatch(/kill -TERM -- "-\$PGID"/);
  const dir = join(root, `src-${id}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'job.sh'), `${prologue}\necho hello-log\nexit 0\n`);
  writeFileSync(join(dir, 'start.sh'), startSh.replace('setsid -f bash job.sh', 'set -m; bash job.sh').replace('< /dev/null', '< /dev/null &'));
  writeFileSync(join(dir, 'meta.json'), '{}');
  return dir;
}

function expectLayout(id: string): void {
  const d = join(home, 'tte-offload/jobs', id);
  expect(readFileSync(join(d, 'pid'), 'utf8').trim()).toMatch(/^\d+$/);
  expect(readFileSync(join(d, 'pgid'), 'utf8').trim()).toMatch(/^\d+$/);
  const st = JSON.parse(readFileSync(join(d, 'status.json'), 'utf8')) as Record<string, unknown>;
  expect(st).toMatchObject({ state: 'done', rc: 0, result: 'ok' });
  expect(existsSync(join(d, 'out/test-results'))).toBe(true);
  expect(existsSync(join(d, 'out/fetch'))).toBe(true);
}

describe('pc-job / pc-remote contract', () => {
  it('shares one job-id rule across renderer, snapshot and transport', () => {
    expect(ID_RE).toBe(JOB_ID_RE);
    for (const bad of ['', 'a b', 'a.b', 'a/b', '-x', 'a;b', 'x'.repeat(65)]) {
      expect(JOB_ID_RE.test(bad)).toBe(false);
      expect(() => renderJob({ id: bad, lane: 'short', source: { sha: 'a'.repeat(40) }, command: ['true'], env: {}, fetch: [], preflight: false })).toThrow(/bad job id/);
      expect(() => planSource(process.cwd(), bad)).toThrow(/bad job id/);
    }
    expect(JOB_ID_RE.test('e2e-short-20261118_1')).toBe(true);
  });

  it('detached: start.sh and job.sh leave pid, status.json, out/output.log and out/ as pc-remote reads them', async () => {
    const dir = jobDir('ct-1');
    expect(await submit(remote, 'ct-1', dir)).toEqual({ detached: true });
    const st = await follow(remote, 'ct-1', sink(), quiet);
    expect(st).toMatchObject({ state: 'done', rc: 0, result: 'ok' });
    expectLayout('ct-1');
    expect(await jobStatus(remote, 'ct-1')).toMatchObject({ state: 'done', rc: 0, result: 'ok' });
    const dest = join(root, 'fetched');
    mkdirSync(dest);
    await fetchResults(remote, 'ct-1', dest);
    expect(readFileSync(join(dest, 'output.log'), 'utf8')).toContain('hello-log');
    expect(existsSync(join(dest, 'test-results'))).toBe(true);
  });

  it('foreground (young WSL): the streamed log is also written to out/output.log and fetched', async () => {
    process.env['FAKE_PID1_AGE'] = '30';
    const dir = jobDir('ct-2');
    expect(await submit(remote, 'ct-2', dir)).toEqual({ detached: false });
    const out = sink();
    const st = await follow(remote, 'ct-2', out, quiet);
    expect(st).toMatchObject({ state: 'done', rc: 0, result: 'ok' });
    expect(out.text()).toContain('hello-log');
    expectLayout('ct-2');
    expect(readFileSync(join(home, 'tte-offload/jobs/ct-2/out/output.log'), 'utf8')).toContain('hello-log');
    const dest = join(root, 'fetched');
    mkdirSync(dest);
    await fetchResults(remote, 'ct-2', dest);
    expect(readFileSync(join(dest, 'output.log'), 'utf8')).toContain('hello-log');
  });
});
