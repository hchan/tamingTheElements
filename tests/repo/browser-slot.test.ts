import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireAny,
  headedFlag,
  isStale,
  main,
  parseCommand,
  pickPort,
  portHolders,
  portFree,
  release,
  STALE_AGE_MS,
  tryAcquire,
  type Clock,
  type Owner,
} from '../../tools/ci/browser-slot';

let root: string;
beforeEach(() => {
  mkdirSync('.scratch', { recursive: true });
  root = resolve(mkdtempSync(join('.scratch', 'slot-')));
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const owner = (pid: number, startedAt = Date.now()): Owner => ({ pid, startedAt, cwd: '/x', cmd: 'c' });
const clock = (now: number, alive: (p: number) => boolean): Clock => ({ now: () => now, isAlive: alive });
const TSX = 'node_modules/tsx/dist/cli.mjs';
const baseEnv = (extra: Record<string, string>): NodeJS.ProcessEnv => ({ ...process.env, CI: '', TTE_BROWSER_SLOT_HELD: '', TTE_BROWSER_LOCK_ROOT: root, ...extra });

describe('browser-slot', () => {
  it('parses the command after --', () => {
    expect(parseCommand(['--', 'playwright', 'test', '--', 'x'])).toEqual(['playwright', 'test', 'x']);
    expect(parseCommand(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('refuses headed, ui and debug unless TTE_ALLOW_HEADED=1', () => {
    expect(headedFlag(['playwright', 'test', '--headed'], {})).toBe('--headed');
    expect(headedFlag(['playwright', 'test', '--ui'], {})).toBe('--ui');
    expect(headedFlag(['playwright', 'test', '--debug'], {})).toBe('--debug');
    expect(headedFlag(['playwright', 'test', '--headed'], { TTE_ALLOW_HEADED: '1' })).toBeUndefined();
    expect(headedFlag(['playwright', 'test'], {})).toBeUndefined();
  });

  it('allows two slots and blocks a third', () => {
    const slots = [join(root, 's1'), join(root, 's2')];
    const live = clock(Date.now(), () => true);
    expect(tryAcquire(slots[0] as string, owner(1), live)).toBe(true);
    expect(tryAcquire(slots[1] as string, owner(2), live)).toBe(true);
    expect(slots.some((s) => tryAcquire(s, owner(3), live))).toBe(false);
    release(slots[0] as string, 1);
    expect(tryAcquire(slots[0] as string, owner(3), live)).toBe(true);
  });

  it('release only removes the caller own slot', () => {
    const d = join(root, 's');
    tryAcquire(d, owner(1), clock(Date.now(), () => true));
    release(d, 2);
    expect(existsSync(d)).toBe(true);
    release(d, 1);
    expect(existsSync(d)).toBe(false);
  });

  it('reclaims a slot whose pid is dead', () => {
    const d = join(root, 's');
    expect(tryAcquire(d, owner(111), clock(Date.now(), () => true))).toBe(true);
    expect(tryAcquire(d, owner(222), clock(Date.now(), (p) => p !== 111))).toBe(true);
    expect(isStale(d, clock(Date.now(), () => true))).toBe(false);
  });

  it('reclaims a slot older than 4 hours even when the pid is alive', () => {
    const d = join(root, 's');
    const t0 = 1_000_000_000_000;
    tryAcquire(d, owner(1, t0), clock(t0, () => true));
    expect(isStale(d, clock(t0 + STALE_AGE_MS - 1, () => true))).toBe(false);
    expect(isStale(d, clock(t0 + STALE_AGE_MS + 1, () => true))).toBe(true);
  });

  it('a slot with no owner.json is stale only once the directory is old', () => {
    const d = join(root, 's');
    mkdirSync(d);
    expect(isStale(d, clock(Date.now(), () => true))).toBe(false);
    expect(isStale(d, clock(Date.now() + 120_000, () => true))).toBe(true);
  });

  it('times out when every slot is held, and names the holder', async () => {
    const slots = [join(root, 's1')];
    tryAcquire(slots[0] as string, owner(1), clock(Date.now(), () => true));
    const c = { t: Date.now() };
    const logs: string[] = [];
    const got = await acquireAny(slots, owner(2), {
      pollMs: 10_000,
      timeoutMs: 120_000,
      clock: { now: () => c.t, isAlive: () => true },
      sleep: (ms) => {
        c.t += ms;
        return Promise.resolve();
      },
      log: (m) => logs.push(m),
    });
    expect(got).toBeUndefined();
    expect(logs.join('\n')).toMatch(/held by pid 1/);
  });

  it('picks the next free port when one is busy', async () => {
    const srv = createServer();
    const port = await new Promise<number>((res) => srv.listen(0, '127.0.0.1', () => { res((srv.address() as { port: number }).port); }));
    try {
      expect(await portFree(port)).toBe(false);
      expect(await pickPort(port)).toBeGreaterThan(port);
      expect(await pickPort(port, 1)).toBeUndefined();
    } finally {
      srv.close();
    }
  });

  it('portHolders parses lsof output and degrades when unknown', () => {
    expect(portHolders(1, () => 'p123\ncnode\np456\ncvite\n')).toBe('pid 123 (node), pid 456 (vite)');
    expect(portHolders(1, () => '')).toMatch(/holder unknown/);
  });

  it('an explicit busy E2E_PORT fails early with exit 2 naming the port and releases locks', async () => {
    const srv = createServer();
    const port = await new Promise<number>((res) => srv.listen(0, '127.0.0.1', () => { res((srv.address() as { port: number }).port); }));
    try {
      const r = spawnSync(process.execPath, [TSX, 'tools/ci/browser-slot.ts', '--', process.execPath, '-e', '0'], {
        encoding: 'utf8',
        env: baseEnv({ E2E_PORT: String(port), TTE_BROWSER_SLOTS: '2' }),
      });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(new RegExp(`E2E_PORT ${String(port)} is already in use by`));
      expect(readdirSync(join(root, 'tte-locks'))).toEqual([]);
    } finally {
      srv.close();
    }
  });

  it('exits 75 when every slot is held by a live owner', () => {
    const slot = join(root, 'tte-locks', 'browser-slot-1');
    mkdirSync(join(root, 'tte-locks'));
    expect(tryAcquire(slot, owner(process.pid), clock(Date.now(), () => true))).toBe(true);
    const r = spawnSync(process.execPath, [TSX, 'tools/ci/browser-slot.ts', '--', process.execPath, '-e', '0'], {
      encoding: 'utf8',
      env: baseEnv({ TTE_BROWSER_SLOTS: '1', TTE_BROWSER_SLOT_TIMEOUT_MS: '300', TTE_BROWSER_SLOT_POLL_MS: '50' }),
    });
    expect(r.status).toBe(75);
    expect(r.stderr).toMatch(/held by pid/);
  });

  it('nested calls skip locking and run the child', async () => {
    const out = join(root, 'out.txt');
    const code = await main(['--', process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(out)}, 'ran')`], baseEnv({ TTE_BROWSER_SLOT_HELD: '1' }));
    expect(code).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe('ran');
    expect(existsSync(join(root, 'tte-locks'))).toBe(false);
  });

  it('a normal run exports E2E_PORT and TTE_BROWSER_SLOT_HELD, and releases its locks', async () => {
    const out = join(root, 'port.txt');
    const code = await main(
      ['--', process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(out)}, process.env.E2E_PORT + ',' + process.env.TTE_BROWSER_SLOT_HELD)`],
      baseEnv({ TTE_BROWSER_SLOTS: '2' }),
    );
    expect(code).toBe(0);
    const [port, held] = readFileSync(out, 'utf8').split(',');
    expect(Number(port)).toBeGreaterThanOrEqual(7000);
    expect(held).toBe('1');
    expect(readdirSync(join(root, 'tte-locks'))).toEqual([]);
    expect(existsSync(join(root, 'tte-e2e.lock'))).toBe(false);
  });

  it('propagates the child exit code', async () => {
    expect(await main(['--', process.execPath, '-e', 'process.exit(7)'], baseEnv({}))).toBe(7);
  });

  it('refuses --headed with exit 2', async () => {
    expect(await main(['--', 'playwright', 'test', '--headed'], baseEnv({ TTE_ALLOW_HEADED: '' }))).toBe(2);
  });

  it('forwards SIGTERM to the child and releases its locks', async () => {
    const child = spawn(process.execPath, [TSX, 'tools/ci/browser-slot.ts', '--', process.execPath, '-e', 'console.log("up");setInterval(()=>{},1000)'], {
      env: baseEnv({ TTE_BROWSER_SLOTS: '2' }),
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise<void>((res) => child.stdout.on('data', (d: Buffer) => {
        if (d.toString().includes('up')) res();
      }),
    );
    expect(readdirSync(join(root, 'tte-locks'))).toHaveLength(1);
    child.kill('SIGTERM');
    await new Promise<void>((res) => child.on('close', () => { res(); }));
    // The spawned process is the tsx launcher, which relays SIGTERM to the real browser-slot process and may exit before that
    // process has released its locks (the flake at low load). Wait for the release instead of reading the directory at once.
    const deadline = Date.now() + 10_000;
    while ((readdirSync(join(root, 'tte-locks')).length > 0 || existsSync(join(root, 'tte-e2e.lock'))) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(readdirSync(join(root, 'tte-locks'))).toEqual([]);
    expect(existsSync(join(root, 'tte-e2e.lock'))).toBe(false);
  }, 30_000);
});
