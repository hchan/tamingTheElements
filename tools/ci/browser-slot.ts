/**
 * Browser-slot wrapper: `tsx tools/ci/browser-slot.ts -- <cmd...>` (the pnpm e2e/visual/soak scripts use it).
 * Limits load on a shared machine: one browser job per checkout (a lock in the git dir), at most TTE_BROWSER_SLOTS
 * (default 2) browser jobs across all worktrees (mkdir slots in the git common dir), and a free per-checkout port
 * exported as E2E_PORT. Nested calls (TTE_BROWSER_SLOT_HELD=1) and CI are pass-through. Headless only.
 * Exit codes: the child's, 75 slot wait timed out, 2 usage error. See docs/TESTING.md.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { defaultE2ePort } from './e2e-port';

export const EXIT_SLOT_TIMEOUT = 75;
export const STALE_AGE_MS = 4 * 3600_000;
export const POLL_MS = 10_000;
export const WAIT_TIMEOUT_MS = 45 * 60_000;
const PORT_TRIES = 20;

type Env = Readonly<Record<string, string | undefined>>;

export interface Owner {
  pid: number;
  startedAt: number;
  cwd: string;
  cmd: string;
}

/**
 * The command after the first `--` (or all args when there is none). Further bare `--` tokens are dropped: pnpm
 * forwards the `--` of `pnpm e2e -- --list` literally, and Playwright would then read `--list` as a test filter
 * and run the whole suite.
 */
export function parseCommand(argv: readonly string[]): string[] {
  const i = argv.indexOf('--');
  const cmd = i < 0 ? [...argv] : argv.slice(i + 1);
  return cmd.filter((a, j) => j === 0 || a !== '--');
}

/** Headed/UI/debug modes need a display and pile up on a busy machine; refuse unless TTE_ALLOW_HEADED=1. */
export function headedFlag(cmd: readonly string[], env: Env = process.env): string | undefined {
  if (env['TTE_ALLOW_HEADED'] === '1') return undefined;
  return cmd.find((a) => a === '--headed' || a === '--ui' || a === '--debug' || a.startsWith('--ui-') || a.startsWith('--headed='));
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readOwner(dir: string): Owner | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, 'owner.json'), 'utf8')) as Owner;
  } catch {
    return undefined;
  }
}

export interface Clock {
  now(): number;
  isAlive(pid: number): boolean;
}
const realClock: Clock = { now: () => Date.now(), isAlive: pidAlive };

/** True when the slot directory has no live owner or is older than STALE_AGE_MS. */
export function isStale(dir: string, clock: Clock = realClock): boolean {
  const o = readOwner(dir);
  if (!o) {
    // mkdir succeeded but owner.json is not written yet: only stale when the directory itself is old.
    try {
      return clock.now() - statSync(dir).mtimeMs > 60_000;
    } catch {
      return false;
    }
  }
  return !clock.isAlive(o.pid) || clock.now() - o.startedAt > STALE_AGE_MS;
}

/** Atomically takes a lock directory (reclaiming a stale one). Returns false when held by a live owner. */
export function tryAcquire(dir: string, owner: Owner, clock: Clock = realClock): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(dir);
      writeFileSync(join(dir, 'owner.json'), JSON.stringify(owner));
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (!isStale(dir, clock)) return false;
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return false;
}

export function release(dir: string, pid: number = process.pid): void {
  if (readOwner(dir)?.pid === pid) rmSync(dir, { recursive: true, force: true });
}

export interface WaitOptions {
  pollMs?: number;
  timeoutMs?: number;
  clock?: Clock;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

/** Waits for one of `dirs` (tried in order). Returns the taken dir, or undefined on timeout. */
export async function acquireAny(dirs: readonly string[], owner: Owner, opts: WaitOptions = {}): Promise<string | undefined> {
  const clock = opts.clock ?? realClock;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollMs = opts.pollMs ?? POLL_MS;
  const timeoutMs = opts.timeoutMs ?? WAIT_TIMEOUT_MS;
  const start = clock.now();
  let lastLog = start;
  for (;;) {
    for (const d of dirs) if (tryAcquire(d, owner, clock)) return d;
    const t = clock.now();
    if (t - start >= timeoutMs) return undefined;
    if (t - lastLog >= 60_000 || t === start) {
      const h = dirs.map((d) => readOwner(d)).find((o) => o);
      opts.log?.(`browser-slot: waiting${h ? ` (held by pid ${String(h.pid)} in ${h.cwd}: ${h.cmd})` : ''}`);
      lastLog = t;
    }
    await sleep(pollMs);
  }
}

/** True when nothing listens on `port` at 127.0.0.1 and ::1 (an unavailable ::1 counts as free). */
export function portFree(port: number): Promise<boolean> {
  const probe = (host: string): Promise<boolean> =>
    new Promise((res) => {
      const s = createServer();
      s.once('error', (e: NodeJS.ErrnoException) => res(e.code !== 'EADDRINUSE'));
      s.listen(port, host, () => s.close(() => res(true)));
    });
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then(([a, b]) => a && b);
}

/** First free port from `start` (up to `tries` ports), or undefined. */
export async function pickPort(start: number, tries = PORT_TRIES, free: (p: number) => Promise<boolean> = portFree): Promise<number | undefined> {
  for (let p = start; p < start + tries; p++) if (await free(p)) return p;
  return undefined;
}

function gitDir(cwd: string, flag: '--git-dir' | '--git-common-dir'): string {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', flag], { cwd, encoding: 'utf8' });
  const out = r.stdout.trim();
  if (r.status !== 0 || !out) throw new Error(`browser-slot: not a git checkout (${cwd})`);
  return resolve(cwd, out);
}

function runChild(cmd: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((res) => {
    const child = spawn(cmd[0] as string, cmd.slice(1), { stdio: 'inherit', env });
    const fwd = (sig: NodeJS.Signals) => () => child.kill(sig);
    const handlers = (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map((s) => [s, fwd(s)] as const);
    for (const [s, h] of handlers) process.on(s, h);
    const done = (code: number): void => {
      for (const [s, h] of handlers) process.off(s, h);
      res(code);
    };
    child.on('error', (e) => {
      process.stderr.write(`browser-slot: cannot run ${cmd[0] as string}: ${e.message}\n`);
      done(127);
    });
    child.on('close', (code, sig) => {
      done(code ?? (sig ? 128 + (({ SIGINT: 2, SIGHUP: 1, SIGTERM: 15 } as Record<string, number>)[sig] ?? 0) : 1));
    });
  });
}

export async function main(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const cmd = parseCommand(argv);
  if (cmd.length === 0) {
    process.stderr.write('usage: tsx tools/ci/browser-slot.ts -- <cmd...>\n');
    return 2;
  }
  const bad = headedFlag(cmd, env);
  if (bad) {
    process.stderr.write(`browser-slot: ${bad} refused (headless only; set TTE_ALLOW_HEADED=1 to override)\n`);
    return 2;
  }
  if (env['CI'] || env['TTE_BROWSER_SLOT_HELD'] === '1') return runChild(cmd, env);

  const cwd = process.cwd();
  const owner: Owner = { pid: process.pid, startedAt: Date.now(), cwd, cmd: cmd.join(' ').slice(0, 200) };
  const timeoutMs = Number(env['TTE_BROWSER_SLOT_TIMEOUT_MS'] ?? WAIT_TIMEOUT_MS);
  const pollMs = Number(env['TTE_BROWSER_SLOT_POLL_MS'] ?? POLL_MS);
  const log = (m: string): void => void process.stderr.write(`${m}\n`);
  const n = Math.max(1, Number(env['TTE_BROWSER_SLOTS'] ?? 2) || 2);

  // TTE_BROWSER_LOCK_ROOT relocates all locks (tests only).
  const lockRoot = env['TTE_BROWSER_LOCK_ROOT'];
  const checkoutLock = join(lockRoot ?? gitDir(cwd, '--git-dir'), 'tte-e2e.lock');
  const slotRoot = join(lockRoot ?? gitDir(cwd, '--git-common-dir'), 'tte-locks');
  mkdirSync(slotRoot, { recursive: true });
  const held: string[] = [];
  const releaseAll = (): void => {
    for (const d of held.splice(0)) release(d);
  };
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    // Before the child exists a signal just releases and exits; afterwards runChild forwards it and finally releases.
    process.once(s, () => {
      releaseAll();
      process.exit(128 + ({ SIGINT: 2, SIGHUP: 1, SIGTERM: 15 } as const)[s]);
    });
  }
  try {
    const mine = await acquireAny([checkoutLock], owner, { pollMs, timeoutMs, log });
    if (!mine) return EXIT_SLOT_TIMEOUT;
    held.push(mine);
    const slots = Array.from({ length: n }, (_, i) => join(slotRoot, `browser-slot-${String(i + 1)}`));
    const slot = await acquireAny(slots, owner, { pollMs, timeoutMs, log });
    if (!slot) return EXIT_SLOT_TIMEOUT;
    held.push(slot);

    const wanted = env['E2E_PORT'] ? Number(env['E2E_PORT']) : defaultE2ePort(cwd);
    const port = await pickPort(wanted);
    if (port === undefined) {
      log(`browser-slot: no free port from ${String(wanted)}`);
      return 2;
    }
    // From here runChild forwards signals to the child and `finally` releases the locks.
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGHUP');
    return await runChild(cmd, { ...env, TTE_BROWSER_SLOT_HELD: '1', E2E_PORT: String(port) });
  } finally {
    releaseAll();
  }
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('browser-slot.ts')) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(2);
    },
  );
}
