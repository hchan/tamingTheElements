import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SETUP = 'tools/dev/pc-setup.sh';
const REMOTE = 'tools/dev/remote-run.sh';
const read = (p: string): string => readFileSync(p, 'utf8');

let root: string;
beforeEach(() => {
  mkdirSync('.scratch', { recursive: true });
  root = resolve(mkdtempSync(join('.scratch', 'pcsetup-')));
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const sh = (cmd: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env } });

describe('pc scripts', () => {
  it('parse with bash -n', () => {
    expect(sh('bash', ['-n', SETUP]).status).toBe(0);
    expect(sh('bash', ['-n', REMOTE]).status).toBe(0);
  });

  it('remote-run.sh locks the full lane, waits with -w, exits 95 when busy, sends keepalives', () => {
    const t = read(REMOTE);
    expect(t).toContain('flock -w');
    expect(t).toContain('locks/full.lock');
    expect(t).toMatch(/exit 95/);
    expect(t).toContain('ServerAliveInterval=15');
    expect(t).toContain('ServerAliveCountMax=8');
    expect(t).toMatch(/exit 96|rc=96/); // frame preflight keeps 96
    // every ssh call goes through the option array
    const calls = t.split('\n').filter((l) => /^ssh /.test(l));
    expect(calls.length).toBeGreaterThan(0);
    for (const l of calls) expect(l).toContain('"${sshopts[@]}"');
  });

  it('remote-run.sh rejects a non-numeric -w before touching anything', () => {
    const r = sh('bash', [REMOTE, '-w', 'abc', '--', 'true'], { TTE_REMOTE: 'nowhere' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('-w');
  });

  it('pc-setup.sh is sudo-free and mentions the lanes, Georgia and the idle timeout', () => {
    const t = read(SETUP);
    expect(t).not.toMatch(/(^|[;&|(]|\s)sudo\s+\S/m); // no sudo invocation
    expect(t).toContain('locks');
    expect(t).toContain('Georgia');
    expect(t).toContain('instanceIdleTimeout');
    expect(t).toContain('fc-cache');
  });

  it('pc-setup.sh builds the layout and the short clone, and is idempotent', () => {
    const home = join(root, 'home');
    const origin = join(root, 'origin.git');
    const off = join(home, 'tte-offload');
    mkdirSync(join(off, 'tamingTheElements'), { recursive: true });
    expect(sh('git', ['init', '-q', '-b', 'main', '--bare', origin]).status).toBe(0);
    const seed = join(root, 'seed');
    expect(sh('git', ['init', '-q', seed]).status).toBe(0);
    writeFileSync(join(seed, 'a.txt'), 'x');
    const id = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid'];
    sh('git', ['-C', seed, 'add', '.']);
    expect(sh('git', ['-C', seed, ...id, 'commit', '-qm', 'init']).status).toBe(0);
    expect(sh('git', ['-C', seed, 'push', '-q', origin, 'HEAD:refs/heads/main']).status).toBe(0);
    expect(sh('git', ['clone', '-q', origin, join(off, 'tamingTheElements')]).status).toBe(0);

    const env = {
      HOME: home,
      TTE_SETUP_SKIP_INSTALL: '1',
      TTE_WIN_FONTS: join(root, 'no-fonts'),
      TTE_WSLCONFIG: join(root, 'no-wslconfig'),
    };
    for (let i = 0; i < 2; i++) {
      const r = sh('bash', [SETUP], env);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('layout: ok');
      expect(r.stdout).toContain(i === 0 ? 'short clone: ok (cloned)' : 'short clone: ok (fetched)');
      expect(r.stdout).toContain('WARN: no georgia');
      expect(r.stdout).toContain('instanceIdleTimeout unknown');
    }
    for (const p of ['locks/full.lock', 'locks/short.lock', 'jobs', 'tmp/short', 'tmp/full', 'results', 'lanes/short/tamingTheElements/a.txt']) {
      expect(existsSync(join(off, p)), p).toBe(true);
    }
  });

  it('pc-setup.sh links Georgia fonts and reads the idle timeout', () => {
    const home = join(root, 'home');
    const fonts = join(root, 'fonts');
    mkdirSync(fonts, { recursive: true });
    writeFileSync(join(fonts, 'georgia.ttf'), '');
    const cfg = join(root, 'wslconfig');
    writeFileSync(cfg, '[general]\ninstanceIdleTimeout=-1\n');
    mkdirSync(home, { recursive: true });
    const r = sh('bash', [SETUP], { HOME: home, TTE_SETUP_SKIP_INSTALL: '1', TTE_WIN_FONTS: fonts, TTE_WSLCONFIG: cfg });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('instanceIdleTimeout: ok');
    expect(existsSync(join(home, '.local/share/fonts/windows-georgia/georgia.ttf'))).toBe(true);
  });
});
