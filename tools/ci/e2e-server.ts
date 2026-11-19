/**
 * Playwright webServer wrapper: builds the bundle once, then runs `vite preview` under supervision.
 * If the preview dies (a full e2e run once lost it and failed 318 tests with ERR_CONNECTION_REFUSED), the exit
 * code/signal is logged to the server log (`.scratch/e2e-server.log`) and it is restarted on the same port, so tests
 * see a brief blip instead of a cascade. A health probe also restarts a preview that is alive but not answering.
 * Vite is spawned directly (never through corepack/pnpm), so every pid we hold and kill is the real server, and it stays
 * in Playwright's process group so Playwright's teardown reaches it. The supervisor stops vite on SIGTERM/SIGINT/SIGHUP
 * and when its parent goes away (stdin pipe closed), so a killed run leaves no orphan.
 * Usage: tsx tools/ci/e2e-server.ts <port> [--mode m] [--out-dir d] [--base /b/]   (see playwright.config.ts)
 * Test hooks: TTE_E2E_SERVER_VITE_BIN, TTE_E2E_SERVER_LOG, TTE_E2E_SERVER_TIMING, TTE_E2E_SERVER_WATCH_PARENT=0.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, fstatSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { isatty } from 'node:tty';
import { logPathFor, parseServerArgs, timingFrom } from './e2e-server-policy';

type Env = Readonly<Record<string, string | undefined>>;

/** vite's CLI script: TTE_E2E_SERVER_VITE_BIN (tests), else the `bin.vite` entry of the installed package. */
export function viteBinPath(env: Env): string {
  const override = env['TTE_E2E_SERVER_VITE_BIN'];
  if (override) return resolve(override);
  const pkgPath = createRequire(import.meta.url).resolve('vite/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { bin: string | Record<string, string> };
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['vite'];
  if (!bin) throw new Error('e2e-server: vite package has no bin entry');
  return join(dirname(pkgPath), bin);
}

const noop = (): void => undefined;

export async function main(argv: readonly string[], env: Env = process.env): Promise<void> {
  const { port, mode, outDir: outArg, base } = parseServerArgs(argv, env);
  const timing = timingFrom(env);
  const outDir = outArg ?? 'node_modules/.tte-e2e';
  const logFile = logPathFor(env);
  const viteBin = viteBinPath(env);
  mkdirSync(dirname(logFile), { recursive: true });
  // Playwright may be gone when we write; the log file still gets every line.
  process.stdout.on('error', noop);
  process.stderr.on('error', noop);

  const log = (msg: string): void => {
    const line = `${new Date().toISOString()} [port ${port} sup ${String(process.pid)}] ${msg}\n`;
    appendFileSync(logFile, line);
    process.stderr.write(line);
  };

  let child: ChildProcess | undefined;
  let stopping = false;
  let restarts = 0;
  let failedProbes = 0;
  let restartTimer: NodeJS.Timeout | undefined;

  /** Stops vite (SIGTERM, then SIGKILL after the grace), writes the last line and exits. Safe to call twice. */
  const stop = (reason: string, code = 0): void => {
    if (stopping) return;
    stopping = true;
    if (restartTimer) clearTimeout(restartTimer);
    const c = child;
    const finish = (): never => {
      log(`stop: ${reason}`);
      process.exit(code);
    };
    if (!c || c.exitCode !== null || c.signalCode !== null) return finish();
    const hard = setTimeout(() => c.kill('SIGKILL'), timing.stopGraceMs);
    c.once('exit', () => {
      clearTimeout(hard);
      finish();
    });
    c.kill('SIGTERM');
  };
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(sig, () => stop(sig));

  // Parent gone: Playwright stops the group itself on a normal end, but a SIGKILLed runner leaves nothing to stop us.
  // Its stdin pipe closes then. /dev/null, files and TTYs are not watched (manual runs keep working).
  if (env['TTE_E2E_SERVER_WATCH_PARENT'] !== '0') {
    try {
      const st = fstatSync(0);
      if ((st.isFIFO() || st.isSocket()) && !isatty(0)) {
        process.stdin.resume();
        for (const ev of ['end', 'close', 'error'] as const) process.stdin.on(ev, () => stop('parent gone (stdin closed)'));
      }
    } catch {
      // no stdin: nothing to watch
    }
  }

  // Build once (async, so signals are still handled while it runs).
  const started = Date.now();
  const buildCode = await new Promise<number>((res) => {
    const b = spawn(process.execPath, [viteBin, 'build', '--mode', mode, '--outDir', outDir, '--base', base, '--emptyOutDir'], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child = b;
    b.on('error', () => res(1));
    b.on('exit', (code, signal) => res(code ?? (signal ? 1 : 0)));
  });
  child = undefined;
  if (stopping) return;
  if (buildCode !== 0) {
    log(`build failed status=${String(buildCode)}`);
    process.exit(buildCode);
  }
  log(`build ok in ${((Date.now() - started) / 1000).toFixed(1)} s (mode ${mode}, outDir ${outDir}, base ${base})`);

  const start = (): void => {
    const c = spawn(process.execPath, [viteBin, 'preview', '--outDir', outDir, '--base', base, '--port', port, '--strictPort'], {
      stdio: ['pipe', 'inherit', 'pipe'], // stdin stays an open pipe: `ignore` would show a future vite an instant EOF
    });
    child = c;
    log(`preview started pid=${String(c.pid)}`);
    c.stderr.on('data', (d: Buffer) => process.stderr.write(d));
    c.on('exit', (code, signal) => {
      if (stopping || c !== child) return;
      log(`preview EXITED unexpectedly code=${String(code)} signal=${String(signal)}`);
      if (++restarts > timing.maxRestarts) {
        log('too many restarts, giving up');
        process.exit(1);
      }
      // After a SIGTERM (something outside sent it, maybe to the whole group) wait, then re-check we are not stopping.
      const delay = code === 143 || signal === 'SIGTERM' ? timing.termDebounceMs + timing.restartMs : timing.restartMs;
      restartTimer = setTimeout(() => {
        if (!stopping) start();
      }, delay);
    });
  };

  start();

  setInterval(() => {
    if (stopping) return;
    fetch(`http://localhost:${port}${base}`, { signal: AbortSignal.timeout(5000) })
      .then(async (res) => {
        await res.body?.cancel();
        failedProbes = 0;
      })
      .catch((e: unknown) => {
        // Only a hung server needs a kill; a dead one is already handled by the exit handler.
        if (child === undefined || child.exitCode !== null || child.signalCode !== null) return;
        if (++failedProbes >= 3) {
          log(`preview unresponsive (${String(e)}); killing for restart`);
          failedProbes = 0;
          child.kill('SIGKILL');
        }
      });
  }, timing.probeMs);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('e2e-server.ts')) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  });
}
