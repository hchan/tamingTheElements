import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LANES } from '../../tools/ci/pc-job';
import { cacheFile, formatProbe, main, noteExit, parseProbe, probe, probeExit, probeScript, readCache, writeCache, type Probe } from '../../tools/ci/pc-probe';
import type { Remote } from '../../tools/ci/pc-remote';

const FAKE = resolve('tests/repo/fixtures/fake-ssh.sh');
const ALIAS = 'secret-pc-alias';
let root: string;
let home: string;
let saved: NodeJS.ProcessEnv;
let remote: Remote;

beforeEach(() => {
  mkdirSync('.scratch', { recursive: true });
  root = resolve(mkdtempSync(join('.scratch', 'pcp-')));
  home = join(root, 'home');
  mkdirSync(home);
  saved = { ...process.env };
  process.env['HOME'] = home;
  process.env['FAKE_SSH_LOG'] = join(root, 'ssh.log');
  process.env['FAKE_SSH_CALLS'] = join(root, 'calls.log');
  process.env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['FAKE_SSH_DOWN', 'FAKE_SSH_SLEEP', 'FAKE_SSH_STATE'].includes(k)));
  remote = { alias: ALIAS, distro: 'Ubuntu', ssh: FAKE };
});
afterEach(() => {
  process.env = saved;
  rmSync(root, { recursive: true, force: true });
});

const GOOD = [
  'v=1', 'pid1_age=5000', 'load1=0.40', 'nproc=16', 'mem_kb=16000000', 'disk_kb=200000000', 'gpu=41', 'gpu_apps=0',
  'lane_short=idle', 'queued_short=0', 'clone_short=1', 'lane_full=idle', 'queued_full=0', 'clone_full=1',
  'frames_ok_age=100', 'frames_stall_age=', 'frames=skipped',
];
const text = (over: Record<string, string | null> = {}): string => {
  const m = new Map(GOOD.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  for (const [k, v] of Object.entries(over)) {
    if (v === null) m.delete(k);
    else m.set(k, v);
  }
  return [...m].map(([k, v]) => `${k}=${v}`).join('\n');
};
const mkClones = (): void => {
  for (const l of Object.values(LANES)) mkdirSync(join(home, 'tte-offload', l.clone, '.git'), { recursive: true });
};
const run = (arg?: string): string =>
  execFileSync('bash', ['-s', ...(arg ? [arg] : [])], { input: probeScript(), encoding: 'utf8', env: { ...process.env, HOME: home } });

describe('parseProbe', () => {
  it('classifies a healthy PC as up', () => {
    const p = parseProbe(text(), 0, 1000);
    expect(p).toMatchObject({ state: 'up', gpuJobs: 0, young: false, at: 1000, lanes: { short: 'idle', full: 'idle' }, memMb: 15625, diskGb: 191 });
  });
  it.each([
    ['', 255, 'unreachable'],
    ['', 124, 'timeout'],
    ['', 0, 'wsl'],
    ['garbage', 1, 'wsl'],
  ])('down: %j code %i -> %s', (out, code, why) => {
    expect(parseProbe(out, code, 1)).toEqual({ state: 'down', why, at: 1 });
  });
  it.each([
    [{ load1: '10.5' }, 'busy', 'load'],
    [{ load1: '10' }, 'up', undefined],
    [{ mem_kb: '3000000' }, 'busy', 'ram'],
    [{ mem_kb: '3670016' }, 'up', undefined],
    [{ disk_kb: '9000000' }, 'broken', 'disk'],
    [{ clone_full: '0' }, 'broken', 'clone'],
    [{ frames_stall_age: '30', frames_ok_age: '100' }, 'broken', 'frames'],
    [{ frames_stall_age: '30', frames_ok_age: null }, 'broken', 'frames'],
    [{ frames_stall_age: '300', frames_ok_age: '100' }, 'up', undefined],
    [{ frames_stall_age: '700', frames_ok_age: null }, 'up', undefined],
    [{ load1: null, mem_kb: null, disk_kb: null, gpu: null, nproc: null, frames_ok_age: null }, 'up', undefined],
    [{ lane_short: 'busy', gpu_apps: '1', pid1_age: '30' }, 'up', undefined],
  ] as [Record<string, string | null>, string, string | undefined][])('%j -> %s %s', (over, state, why) => {
    const p = parseProbe(text(over), 0, 1);
    expect(p.state).toBe(state);
    expect('why' in p ? p.why : undefined).toBe(why);
  });
  it('reads lanes, gpu jobs and a young WSL', () => {
    const p = parseProbe(text({ lane_short: 'busy', gpu_apps: '2', pid1_age: '30', queued_short: '3' }), 0, 1);
    expect(p).toMatchObject({ lanes: { short: 'busy', full: 'idle' }, gpuJobs: 2, young: true, queued: { short: 3, full: 0 } });
  });
  it('maps probe states to the CLI exit codes', () => {
    const texts = [text(), text({ load1: '20' }), text({ disk_kb: '1' }), text({ clone_short: '0' }), text({ frames_stall_age: '1' })];
    expect(texts.map((t) => probeExit(parseProbe(t, 0, 1)))).toEqual([0, 0, 97, 97, 96]);
    expect(probeExit(parseProbe('', 255, 1))).toBe(94);
  });
});

describe('probeScript', () => {
  it('is valid bash that names every lane clone and lock, and carries no secrets', () => {
    const s = probeScript();
    const f = join(root, 'p.sh');
    writeFileSync(f, s);
    expect(spawnSync('bash', ['-n', f], { encoding: 'utf8' }).status).toBe(0);
    for (const [n, l] of Object.entries(LANES)) expect(s).toContain(`lane ${n} ${l.clone} ${l.lock}`);
    expect(s).not.toMatch(/\/Users\/|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|@/);
    expect(() => probeScript({ short: { ...LANES.short, clone: 'a b' }, full: LANES.full })).toThrow(/unsafe/);
  });
  it('prints key=value lines and reports missing clones', () => {
    const out = run();
    for (const k of ['v=1', 'lane_short=idle', 'queued_short=0', 'clone_short=0', 'clone_full=0', 'frames=skipped', 'frames_ok_age=', 'frames_stall_age=']) expect(out).toContain(k);
    expect(out.split('\n').filter((l) => l !== '' && !/^[a-z0-9_]+=.*$/.test(l))).toEqual([]);
    expect(parseProbe(out, 0, 1)).toMatchObject({ state: 'broken', why: 'clone' });
  });
  it('counts queued jobs and reads the frame evidence files', () => {
    mkClones();
    const jd = join(home, 'tte-offload/jobs/20261118-120000-short-aaaaaa');
    mkdirSync(jd, { recursive: true });
    writeFileSync(join(jd, 'status.json'), '{"state":"queued","rc":0}');
    mkdirSync(join(home, 'tte-offload/state'), { recursive: true });
    writeFileSync(join(home, 'tte-offload/state/frames-stall'), '');
    const old = new Date(Date.now() - 3_000_000);
    writeFileSync(join(home, 'tte-offload/state/frames-ok'), '');
    utimesSync(join(home, 'tte-offload/state/frames-ok'), old, old);
    const out = run();
    expect(out).toContain('queued_short=1');
    expect(out).toMatch(/frames_stall_age=[0-5]\n/);
    expect(out).toMatch(/frames_ok_age=\d{4}\n/);
    expect(parseProbe(out.replace(/disk_kb=.*\n/, ''), 0, 1)).toMatchObject({ state: 'broken', why: 'frames' });
  });
  it.each([
    [0, 'ok', 'frames-ok'],
    [96, 'stall', 'frames-stall'],
  ])('--frames with a check exiting %i records %s', (rc, res, file) => {
    mkClones();
    const dev = join(home, 'tte-offload', LANES.short.clone, 'tools/dev');
    mkdirSync(dev, { recursive: true });
    writeFileSync(join(dev, 'pc-frame-check.cjs'), `process.exit(${String(rc)});\n`);
    const out = run('frames');
    expect(out).toContain(`frames=${res}`);
    expect(existsSync(join(home, 'tte-offload/state', file))).toBe(true);
    expect(run()).toContain('frames=skipped');
  });
});

describe('probe (fake ssh)', () => {
  const calls = (): number => (existsSync(join(root, 'calls.log')) ? readFileSync(join(root, 'calls.log'), 'utf8').trim().split('\n').length : 0);
  it('runs the script in one call and hashes the alias', async () => {
    mkClones();
    const p = await probe(remote);
    expect(p.state === 'up' || p.state === 'busy' || (p.state === 'broken' && p.why === 'disk')).toBe(true);
    expect(calls()).toBe(1);
    expect(p.key).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(p)).not.toContain(ALIAS);
  });
  it('retries once when ssh fails, then reports unreachable', async () => {
    process.env['FAKE_SSH_DOWN'] = '1';
    const p = await probe(remote);
    expect(p).toMatchObject({ state: 'down', why: 'unreachable' });
    expect(calls()).toBe(2);
    rmSync(join(root, 'calls.log'));
    await probe(remote, { tries: 1 });
    expect(calls()).toBe(1);
  });
  it('gives up at the time limit', async () => {
    process.env['FAKE_SSH_SLEEP'] = '3';
    const t0 = Date.now();
    const p = await probe(remote, { timeoutMs: 400 });
    expect(p).toMatchObject({ state: 'down', why: 'timeout' });
    expect(Date.now() - t0).toBeLessThan(2500);
  });
  it('--frames returns the stall verdict', async () => {
    mkClones();
    const dev = join(home, 'tte-offload', LANES.short.clone, 'tools/dev');
    mkdirSync(dev, { recursive: true });
    writeFileSync(join(dev, 'pc-frame-check.cjs'), 'process.exit(96);\n');
    expect(await probe(remote, { frames: true })).toMatchObject({ state: 'broken', why: 'frames', frames: 'stall' });
  });
});

describe('cache', () => {
  const up = (at: number, key?: string): Probe => ({ state: 'up', lanes: { short: 'idle', full: 'idle' }, gpuJobs: 0, young: false, at, ...(key ? { key } : {}) });
  it('honours the TTL and the alias hash, and writes atomically', () => {
    const f = join(root, 'sub', 'c.json');
    expect(readCache(f, 1000, 60)).toBeUndefined();
    writeCache(f, up(1000, 'abc'));
    expect(readdirSync(join(root, 'sub'))).toEqual(['c.json']);
    expect(readCache(f, 1000 + 59_000, 60)?.state).toBe('up');
    expect(readCache(f, 1000 + 61_000, 60)).toBeUndefined();
    expect(readCache(f, 1000, 60, 'abc')).toBeDefined();
    expect(readCache(f, 1000, 60, 'other')).toBeUndefined();
    writeFileSync(f, '{not json');
    expect(readCache(f, 1000, 60)).toBeUndefined();
  });
  it('noteExit records what an attempt learned', () => {
    const f = join(root, 'c.json');
    const now = 5000;
    noteExit(f, 2, now);
    expect(readCache(f, now, 60)).toBeUndefined();
    noteExit(f, 94, now);
    expect(readCache(f, now, 60)).toMatchObject({ state: 'down', why: 'unreachable' });
    noteExit(f, 96, now);
    expect(readCache(f, now, 60)).toMatchObject({ state: 'broken', why: 'frames' });
    noteExit(f, 95, now);
    expect(readCache(f, now, 60)).toMatchObject({ state: 'busy' });
    writeCache(f, up(now, 'k1'));
    noteExit(f, 94, now + 1);
    expect(readCache(f, now + 1, 60)).toMatchObject({ state: 'down', key: 'k1' });
    noteExit(f, 0, now + 2);
    expect(readCache(f, now + 2, 60)).toMatchObject({ state: 'up', key: 'k1' });
  });
  it('lives in the git common dir', () => {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
    expect(cacheFile(process.cwd())).toBe(join(resolve(process.cwd(), common), 'tte-pc-probe.json'));
  });
});

describe('pc:probe CLI', () => {
  const sink = (): { write(s: string): void; text(): string } => {
    let t = '';
    return { write: (s) => void (t += s), text: () => t };
  };
  let repo: string;
  beforeEach(() => {
    repo = join(root, 'repo');
    mkdirSync(repo);
    execFileSync('git', ['init', '-q', repo]);
    mkClones();
  });
  const env = (): NodeJS.ProcessEnv => ({ ...process.env, TTE_REMOTE: ALIAS, TTE_SSH: FAKE });
  it('prints one redacted line, then answers from the cache', async () => {
    const o1 = sink();
    const c1 = await main([], env(), repo, o1);
    expect([0, 97]).toContain(c1);
    expect(o1.text().trim().split('\n')).toHaveLength(1);
    expect(o1.text()).toMatch(/^PC (up|busy|broken)/);
    expect(existsSync(join(repo, '.git/tte-pc-probe.json'))).toBe(true);
    const o2 = sink();
    expect(await main([], env(), repo, o2)).toBe(c1);
    expect(o2.text()).toContain('[cached]');
    expect(readFileSync(join(root, 'ssh.log'), 'utf8').trim().split('\n')).toHaveLength(1);
    for (const t of [o1.text(), o2.text(), readFileSync(join(repo, '.git/tte-pc-probe.json'), 'utf8')]) expect(t).not.toContain(ALIAS);
  });
  it('--json prints the view without the alias hash; down exits 94', async () => {
    process.env['FAKE_SSH_DOWN'] = '1';
    const o = sink();
    expect(await main(['--json'], env(), repo, o)).toBe(94);
    expect(JSON.parse(o.text())).toMatchObject({ state: 'down', why: 'unreachable' });
    expect(o.text()).not.toContain('"key"');
    expect(formatProbe(parseProbe('', 255, 1))).toBe('PC down (unreachable)');
  });
  it('rejects unknown flags and a missing remote', async () => {
    expect(await main(['--bogus'], env(), repo, sink())).toBe(2);
    expect(await main([], { ...process.env, TTE_REMOTE: '' }, repo, sink())).toBe(2);
  });
});
