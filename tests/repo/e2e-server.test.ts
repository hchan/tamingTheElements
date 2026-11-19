import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { viteBinPath } from '../../tools/ci/e2e-server';
import { classifyStderr, DEFAULT_TIMING, describeExit, logPathFor, parseLsof, parseServerArgs, restartDecision, timingFrom } from '../../tools/ci/e2e-server-policy';

describe('e2e-server policy: arguments, timing, log path', () => {
  it('parseServerArgs takes a positional port and the pages flags', () => {
    expect(parseServerArgs(['7001'])).toEqual({ port: '7001', mode: 'test', outDir: undefined, base: '/' });
    expect(parseServerArgs(['7002', '--mode', 'production', '--out-dir', 'dist-pages', '--base', '/tamingTheElements/'])).toEqual({
      port: '7002',
      mode: 'production',
      outDir: 'dist-pages',
      base: '/tamingTheElements/',
    });
    expect(parseServerArgs([], { E2E_PORT: '7003' }).port).toBe('7003');
  });

  it('parseServerArgs rejects bad input', () => {
    expect(() => parseServerArgs([])).toThrow(/port/);
    expect(() => parseServerArgs(['abc'])).toThrow(/port/);
    expect(() => parseServerArgs(['70000'])).toThrow(/port/);
    expect(() => parseServerArgs(['7001', '7002'])).toThrow(/unexpected/);
    expect(() => parseServerArgs(['7001', '--nope'])).toThrow(/unknown flag/);
    expect(() => parseServerArgs(['7001', '--mode'])).toThrow(/needs a value/);
    expect(() => parseServerArgs(['7001', '--base', 'x'])).toThrow(/--base/);
  });

  it('timingFrom returns the defaults and validates the tests-only override', () => {
    expect(timingFrom({})).toEqual(DEFAULT_TIMING);
    expect(timingFrom({ TTE_E2E_SERVER_TIMING: '{"probeMs":100}' }).probeMs).toBe(100);
    expect(() => timingFrom({ TTE_E2E_SERVER_TIMING: '{' })).toThrow(/JSON/);
    expect(() => timingFrom({ TTE_E2E_SERVER_TIMING: '[]' })).toThrow(/object/);
    expect(() => timingFrom({ TTE_E2E_SERVER_TIMING: '{"bogus":1}' })).toThrow(/unknown key/);
    expect(() => timingFrom({ TTE_E2E_SERVER_TIMING: '{"probeMs":-1}' })).toThrow(/non-negative/);
    expect(() => timingFrom({ TTE_E2E_SERVER_TIMING: '{"probeMs":"x"}' })).toThrow(/non-negative/);
  });

  it('logPathFor: explicit path, then TTE_RESULTS, then .scratch', () => {
    expect(logPathFor({ TTE_E2E_SERVER_LOG: 'a/b.log', TTE_RESULTS: 'r' })).toBe('a/b.log');
    expect(logPathFor({ TTE_RESULTS: 'r' })).toBe('r/e2e-server.log');
    expect(logPathFor({})).toBe('.scratch/e2e-server.log');
  });
});

// ---- process tests: the real supervisor against tests/repo/fixtures/fake-vite.cjs (no vite, no build, no browser) ----

describe('e2e-server policy: restart and diagnostics', () => {
  const T = DEFAULT_TIMING;
  const base = { uptimeMs: 1000, fastFails: 0, restarts: 0, sigterm: false };

  it('restartDecision backs off exponentially and caps', () => {
    const d = (fastFails: number) => restartDecision({ ...base, fastFails }, T);
    expect(d(0)).toMatchObject({ action: 'restart', delayMs: 250, fastFails: 1 });
    expect(d(1)).toMatchObject({ delayMs: 500, fastFails: 2 });
    expect(d(2)).toMatchObject({ delayMs: 1000 });
    expect(restartDecision({ ...base, fastFails: 10 }, { ...T, fastFailLimit: 99 })).toMatchObject({ delayMs: 15_000 });
  });

  it('restartDecision: a stable preview restarts quickly and resets the failure count', () => {
    expect(restartDecision({ ...base, uptimeMs: 31_000, fastFails: 5 }, T)).toMatchObject({ action: 'restart', delayMs: 100, fastFails: 0 });
  });

  it('restartDecision: SIGTERM waits out the debounce', () => {
    expect(restartDecision({ ...base, uptimeMs: 31_000, sigterm: true }, T)).toMatchObject({ delayMs: 300 });
  });

  it('restartDecision gives up after too many fast failures or restarts', () => {
    expect(restartDecision({ ...base, fastFails: 19 }, T)).toMatchObject({ action: 'give up' });
    expect(restartDecision({ ...base, uptimeMs: 31_000, restarts: 50 }, T)).toMatchObject({ action: 'give up' });
  });

  it('describeExit reads codes and signals in plain words', () => {
    expect(describeExit(143, null)).toMatch(/SIGTERM.*outside/);
    expect(describeExit(130, null)).toMatch(/SIGINT/);
    expect(describeExit(null, 'SIGKILL')).toMatch(/SIGKILL/);
    expect(describeExit(1, null)).toBe('exit 1');
  });

  it('classifyStderr recognises the known failures', () => {
    expect(classifyStderr('Error: listen EADDRINUSE: address already in use')).toBe('port in use');
    expect(classifyStderr('Error: Port 4173 is already in use')).toBe('port in use');
    expect(classifyStderr("ENOENT: no such file or directory, open 'x/index.html'")).toBe('file vanished (ENOENT)');
    expect(classifyStderr('EMFILE: too many open files')).toBe('too many open files');
    expect(classifyStderr('all fine')).toBeUndefined();
  });

  it('parseLsof pairs pids with commands', () => {
    expect(parseLsof('p123\ncnode\np456\ncvite\n')).toEqual([
      { pid: 123, command: 'node' },
      { pid: 456, command: 'vite' },
    ]);
    expect(parseLsof('')).toEqual([]);
  });
});

const TSX = 'node_modules/tsx/dist/cli.mjs';
const FAKE_VITE = resolve('tests/repo/fixtures/fake-vite.cjs');
const FAST = '{"probeMs":100,"probeTimeoutMs":1000,"startupGraceMs":500,"hangMs":3000,"strikes":3,"restartMs":50,"termDebounceMs":100,"backoffBaseMs":20,"backoffMaxMs":100,"fastFailLimit":4,"maxRestarts":10,"stopGraceMs":1000}';

interface Sup {
  child: ChildProcess;
  log: string;
  port: number;
  exited: () => { code: number | null; signal: NodeJS.Signals | null } | undefined;
}

let work: string;
const running: Sup[] = [];
beforeEach(() => {
  mkdirSync('.scratch', { recursive: true });
  work = resolve(mkdtempSync(join('.scratch', 'e2e-server-')));
});
afterEach(async () => {
  for (const s of running.splice(0)) {
    if (s.child.pid !== undefined && !s.exited()) {
      try {
        process.kill(-s.child.pid, 'SIGKILL');
      } catch {
        // already gone
      }
      await waitFor(() => s.exited() !== undefined, 'supervisor exit after cleanup');
    }
  }
  rmSync(work, { recursive: true, force: true });
});

async function waitFor(cond: () => boolean | Promise<boolean>, what: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** A free port from the OS, on the host vite and the probe use. */
function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, 'localhost', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => { res(p); });
    });
  });
}

async function answers(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://localhost:${String(port)}/`, { signal: AbortSignal.timeout(1000) });
    await r.body?.cancel();
    return r.ok;
  } catch {
    return false;
  }
}

async function launch(extraEnv: Record<string, string> = {}, extraArgs: string[] = [], port?: number): Promise<Sup> {
  const p = port ?? (await freePort());
  const log = join(work, 'e2e-server.log');
  const child = spawn(process.execPath, [TSX, 'tools/ci/e2e-server.ts', String(p), '--out-dir', join(work, 'build'), ...extraArgs], {
    detached: true, // own process group, like Playwright's webServer
    stdio: ['pipe', 'ignore', 'ignore'],
    env: {
      ...process.env,
      TTE_E2E_SERVER_VITE_BIN: FAKE_VITE,
      TTE_E2E_SERVER_LOG: log,
      TTE_E2E_SERVER_TIMING: FAST,
      FAKE_STATE_DIR: work,
      ...extraEnv,
    },
  });
  let result: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  child.on('exit', (code, signal) => {
    result = { code, signal };
  });
  const sup: Sup = { child, log, port: p, exited: () => result };
  running.push(sup);
  return sup;
}

const logText = (s: Sup): string => (existsSync(s.log) ? readFileSync(s.log, 'utf8') : '');
const pidsStarted = (s: Sup): number[] => [...logText(s).matchAll(/preview started pid=(\d+)/g)].map((m) => Number(m[1]));
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('e2e-server supervisor (fake vite)', () => {
  it('resolves the real vite CLI script', () => {
    expect(existsSync(viteBinPath({}))).toBe(true);
  });

  it('A: a SIGTERM to vite is logged and the preview comes back with a new pid', async () => {
    const s = await launch();
    await waitFor(() => pidsStarted(s).length === 1, 'first start');
    await waitFor(() => answers(s.port), 'port answers');
    const first = pidsStarted(s)[0] as number;
    process.kill(first, 'SIGTERM');
    await waitFor(() => pidsStarted(s).length === 2, 'restart');
    expect(logText(s)).toMatch(/EXITED unexpectedly.*exit 143/);
    expect(pidsStarted(s)[1]).not.toBe(first);
    await waitFor(() => answers(s.port), 'port answers again');
  });

  it('B: a SIGTERM to the process group (Playwright gracefulShutdown) stops cleanly, no restart', async () => {
    const s = await launch();
    await waitFor(() => answers(s.port), 'port answers');
    const vite = pidsStarted(s)[0] as number;
    process.kill(-(s.child.pid as number), 'SIGTERM');
    await waitFor(() => s.exited() !== undefined, 'supervisor exit');
    expect(logText(s)).toMatch(/stop: SIGTERM/);
    expect(pidsStarted(s)).toHaveLength(1);
    await waitFor(async () => !(await answers(s.port)), 'port refuses');
    await waitFor(() => !alive(vite), 'vite gone');
  });

  it('C: when the parent goes away (stdin closed) the supervisor stops vite and exits: no orphan', async () => {
    const s = await launch();
    await waitFor(() => answers(s.port), 'port answers');
    const vite = pidsStarted(s)[0] as number;
    s.child.stdin?.end();
    await waitFor(() => s.exited() !== undefined, 'supervisor exit');
    expect(logText(s)).toMatch(/stop: parent gone/);
    await waitFor(async () => !(await answers(s.port)), 'port refuses');
    await waitFor(() => !alive(vite), 'vite gone');
  });

  it('F: a failed build is logged and the supervisor exits with its status', async () => {
    const s = await launch({ FAKE_BUILD_EXIT: '3' });
    await waitFor(() => s.exited() !== undefined, 'supervisor exit');
    expect(s.exited()?.code).toBe(3);
    expect(logText(s)).toMatch(/build failed status=3/);
    expect(pidsStarted(s)).toHaveLength(0);
  });

  it('E: a port that stays taken is reported (holder named), backed off, then given up on', async () => {
    const holder = createServer();
    const port = await new Promise<number>((res) => {
      holder.listen(0, 'localhost', () => {
        res((holder.address() as { port: number }).port);
      });
    });
    try {
      const s = await launch({}, [], port);
      await waitFor(() => s.exited() !== undefined, 'supervisor gives up');
      expect(s.exited()?.code).toBe(1);
      const text = logText(s);
      expect(text).toMatch(/stderr says: port in use/);
      expect(text).toMatch(/gave up: 4 fast failures in a row/);
      expect(text).toMatch(/same failure again/);
      if (spawnSync('lsof', ['-v']).error === undefined) expect(text).toContain(`pid ${String(process.pid)}`);
    } finally {
      holder.close();
    }
  });
});
