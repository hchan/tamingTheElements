import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cancel,
  exitCodeOf,
  fetchResults,
  follow,
  jobs,
  jobStatus,
  parseStatus,
  PcError,
  ping,
  sshArgs,
  status,
  submit,
  type Remote,
} from '../../tools/ci/pc-remote';

const FAKE = resolve('tests/repo/fixtures/fake-ssh.sh');
let root: string;
let home: string;
let saved: NodeJS.ProcessEnv;
let n = 0;
let remote: Remote;

beforeEach(() => {
  mkdirSync('.scratch', { recursive: true });
  root = resolve(mkdtempSync(join('.scratch', 'pcr-')));
  home = join(root, 'home');
  mkdirSync(home);
  saved = { ...process.env };
  process.env['HOME'] = home;
  process.env['FAKE_SSH_STATE'] = root;
  process.env['FAKE_SSH_LOG'] = join(root, 'ssh.log');
  delete process.env['FAKE_SSH_DOWN'];
  delete process.env['FAKE_PID1_AGE'];
  // A distinct alias per test keeps the module's uploaded-helper cache from leaking between temp homes.
  remote = { alias: `fake-${String(n++)}`, distro: 'Ubuntu', ssh: FAKE };
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
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A local job dir like the renderer's: start.sh detaches job.sh into its own process group (set -m; macOS has no setsid). */
function makeJob(body: string): string {
  const dir = join(root, 'job-src');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'job.sh'), `#!/bin/bash\necho $$ > pid\nmkdir -p out\n${body}\n`);
  writeFileSync(join(dir, 'start.sh'), '#!/bin/bash\ncd "$(dirname "$0")"\nset -m\nbash job.sh >/dev/null 2>&1 </dev/null &\n');
  writeFileSync(join(dir, 'src.bundle'), 'bundle-bytes');
  writeFileSync(join(dir, 'meta.json'), '{}');
  return dir;
}
const LINES = (count: number, endJson: string, rc: number): string =>
  `echo '{"state":"running"}' > status.json\nfor i in $(seq 1 ${String(count)}); do echo "line $i" >> out/output.log; sleep 0.05; done\necho 'artefact' > out/report.txt\necho '${endJson}' > status.json\nexit ${String(rc)}`;
const expected = (count: number): string => Array.from({ length: count }, (_, i) => `line ${String(i + 1)}\n`).join('');

describe('pc-remote', () => {
  it('builds ssh argument arrays with the safe options and no shell', () => {
    const a = sshArgs({ alias: 'h', distro: 'Ubuntu', ssh: 'ssh' }, ['bash', 'x y']);
    expect(a).toContain('BatchMode=yes');
    expect(a).toContain('ServerAliveInterval=15');
    expect(a.slice(a.indexOf('h'))).toEqual(['h', 'wsl', '-d', 'Ubuntu', '--cd', '~', '--', 'bash', 'x y']);
  });

  it('submits (detached), follows to the end, reads the final status and fetches results', async () => {
    const dir = makeJob(LINES(12, '{"state":"done","rc":1,"result":"fail","runSec":3,"queueSec":1,"maxLoad":2.5}', 1));
    expect(await submit(remote, 'id-1', dir)).toEqual({ detached: true });
    expect(readFileSync(join(home, 'tte-offload/jobs/id-1/src.bundle'), 'utf8')).toBe('bundle-bytes');
    const out = sink();
    const st = await follow(remote, 'id-1', out, quiet);
    expect(out.text()).toBe(expected(12));
    expect(st).toMatchObject({ state: 'done', rc: 1, result: 'fail', runSec: 3, queueSec: 1, maxLoad: 2.5 });
    expect(exitCodeOf(st)).toBe(1);
    const dest = join(root, 'dest');
    mkdirSync(dest);
    await fetchResults(remote, 'id-1', dest);
    expect(readFileSync(join(dest, 'report.txt'), 'utf8')).toBe('artefact\n');
    expect(readFileSync(join(dest, 'output.log'), 'utf8')).toBe(expected(12));
  });

  it('reconnects after ssh exit 255 from the byte offset (no gap, no duplicate)', async () => {
    const dir = makeJob(LINES(20, '{"state":"done","rc":0,"result":"ok"}', 0));
    await submit(remote, 'id-2', dir);
    writeFileSync(join(root, 'drop-follow'), '37'); // mid-line
    const out = sink();
    const err = sink();
    const st = await follow(remote, 'id-2', out, { ...quiet, err });
    expect(out.text()).toBe(expected(20));
    expect(err.text()).toContain('reconnecting from byte 38');
    expect(st.state).toBe('done');
    expect(exitCodeOf(st)).toBe(0);
  });

  it('an abort while following is not reported as an ssh drop', async () => {
    const dir = makeJob(LINES(200, '{"state":"done","rc":0,"result":"ok"}', 0));
    await submit(remote, 'id-abort', dir);
    const ctl = new AbortController();
    const err = sink();
    setTimeout(() => { ctl.abort(); }, 300);
    const st = await follow(remote, 'id-abort', sink(), { ...quiet, err, signal: ctl.signal });
    expect(st.state).toBe('unreachable');
    expect(err.text()).not.toContain('ssh dropped');
    await cancel(remote, 'id-abort');
  });

  it('cancel kills the whole process group and marks the job cancelled', async () => {
    const dir = makeJob('sleep 300 &\necho $! > child\necho \'{"state":"running"}\' > status.json\nwait');
    await submit(remote, 'id-3', dir);
    const jobDir = join(home, 'tte-offload/jobs/id-3');
    for (let i = 0; i < 50 && !existsSync(join(jobDir, 'child')); i++) await wait(100);
    const child = Number(readFileSync(join(jobDir, 'child'), 'utf8'));
    expect(() => process.kill(child, 0)).not.toThrow();
    expect(await cancel(remote, 'id-3')).toBe(true);
    await wait(300);
    expect(() => process.kill(child, 0)).toThrow();
    expect(await jobStatus(remote, 'id-3')).toMatchObject({ state: 'cancelled', rc: 143 });
  });

  it('reports a job whose process vanished without a final status as lost (93)', async () => {
    await submit(remote, 'id-4', makeJob('exit 0'));
    const jobDir = join(home, 'tte-offload/jobs/id-4');
    for (let i = 0; i < 50 && !existsSync(join(jobDir, 'pid')); i++) await wait(100);
    await wait(300);
    writeFileSync(join(jobDir, 'status.json'), '{"state":"running"}');
    process.env['TTE_LOST_POLLS'] = '3';
    const err = sink();
    const st = await follow(remote, 'id-4', sink(), { ...quiet, err });
    expect(st.state).toBe('lost');
    expect(exitCodeOf(st)).toBe(93);
    expect(err.text()).toContain('nothing else of ours was running');
  });

  it('does not declare lost when the final status lands inside the grace window', async () => {
    await submit(remote, 'id-4b', makeJob('exit 0'));
    const jobDir = join(home, 'tte-offload/jobs/id-4b');
    for (let i = 0; i < 50 && !existsSync(join(jobDir, 'pid')); i++) await wait(100);
    await wait(300);
    writeFileSync(join(jobDir, 'status.json'), '{"state":"running"}');
    process.env['TTE_LOST_POLLS'] = '60';
    setTimeout(() => { writeFileSync(join(jobDir, 'status.json'), '{"state":"done","rc":0,"result":"ok"}'); }, 1000);
    const st = await follow(remote, 'id-4b', sink(), quiet);
    expect(st.state).toBe('done');
  });

  it('passes through the PC busy exit 95 and frame exit 96 from the job status', async () => {
    const dir = makeJob('echo "PC busy" >> out/output.log\necho \'{"state":"error","rc":95,"result":"error"}\' > status.json\nexit 95');
    await submit(remote, 'id-5', dir);
    const out = sink();
    const st = await follow(remote, 'id-5', out, quiet);
    expect(out.text()).toBe('PC busy\n');
    expect(exitCodeOf(st)).toBe(95);
    expect(st.result).toBe('error');
    expect(exitCodeOf({ state: 'done', rc: 96 })).toBe(96);
  });

  it('runs in the foreground (with a warning) when the WSL instance is young', async () => {
    process.env['FAKE_PID1_AGE'] = '30';
    const dir = makeJob(LINES(3, '{"state":"done","rc":0,"result":"ok"}', 0));
    expect(await submit(remote, 'id-6', dir)).toEqual({ detached: false });
    expect(existsSync(join(home, 'tte-offload/jobs/id-6/pid'))).toBe(false); // not started by submit
    const st = await follow(remote, 'id-6', sink(), quiet);
    expect(readFileSync(join(home, 'tte-offload/jobs/id-6/out/output.log'), 'utf8')).toBe(expected(3));
    expect(st).toMatchObject({ state: 'done', rc: 0, result: 'ok' });
  });

  it('maps unreachable hosts: ping false, submit 94, follow gives up with 255', async () => {
    expect(await ping(remote)).toBe(true);
    await jobs(remote); // primes the uploaded-helper cache
    process.env['FAKE_SSH_DOWN'] = '1';
    expect(await ping(remote)).toBe(false);
    const st = await follow(remote, 'id-7', sink(), { ...quiet, backoffMs: 5, budgetMs: 30 });
    expect(st.state).toBe('unreachable');
    expect(exitCodeOf(st)).toBe(255);
    const other: Remote = { ...remote, alias: 'fresh' };
    await expect(submit(other, 'id-7', makeJob('exit 0'))).rejects.toMatchObject({ code: 94 });
    await expect(submit(other, 'bad id;rm', makeJob('exit 0'))).rejects.toBeInstanceOf(PcError);
  });

  it('lists jobs newest first and prints a host status', async () => {
    await submit(remote, '20261118-100000-short-aaaaaa', makeJob('echo \'{"state":"done","rc":0}\' > status.json'));
    await submit(remote, '20261118-110000-full-bbbbbb', makeJob('echo \'{"state":"running"}\' > status.json\nsleep 5'));
    await wait(600);
    const list = await jobs(remote, 5);
    expect(list.map((j) => j.id)).toEqual(['20261118-110000-full-bbbbbb', '20261118-100000-short-aaaaaa']);
    expect(list[0]).toMatchObject({ state: 'running' });
    expect(list[1]).toMatchObject({ state: 'done', rc: 0 });
    const text = await status(remote);
    expect(text).toContain('lane full: 20261118-110000-full-bbbbbb');
    expect(text).toContain('lane short: idle');
    await cancel(remote, '20261118-110000-full-bbbbbb');
  });

  it('parses status.json variants and maps exit codes', () => {
    expect(parseStatus('{"state":"done","rc":0,"status":"ok","run_sec":4}')).toEqual({ state: 'done', rc: 0, result: 'ok', runSec: 4 });
    expect(parseStatus('not json')).toEqual({ state: 'unknown', rc: 1 });
    expect(exitCodeOf({ state: 'lost', rc: 1 })).toBe(93);
    expect(exitCodeOf({ state: 'done', rc: 124 })).toBe(124);
  });

  it('stays host-free and the fake ssh parses', () => {
    const src = readFileSync('tools/ci/pc-remote.ts', 'utf8');
    expect(src).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(src).not.toContain('/Users/');
    expect(spawnSync('bash', ['-n', FAKE]).status).toBe(0);
  });
});
