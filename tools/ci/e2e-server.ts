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
import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, fstatSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { isatty } from 'node:tty';
import { e2eBuildDir } from './e2e-port';
import { classifyStderr, describeExit, logPathFor, parseLsof, parseServerArgs, restartDecision, timingFrom } from './e2e-server-policy';

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
const execFileP = promisify(execFile);
const STDERR_LINES = 40;
const LOG_ROTATE_BYTES = 2 * 1024 * 1024;

/** Best-effort command output (2 s timeout; the tool may be missing, e.g. lsof on the PC). */
async function tryRun(cmd: string, args: string[]): Promise<string> {
  try {
    return (await execFileP(cmd, args, { timeout: 2_000, encoding: 'utf8' })).stdout;
  } catch (e: unknown) {
    // lsof exits 1 when nothing listens but may still have printed; anything else is just "unknown".
    return typeof e === 'object' && e !== null && 'stdout' in e && typeof e.stdout === 'string' ? e.stdout : '';
  }
}

/** Who listens on a port: `pid N (command), ppid P, up T: full command` per listener; "orphan" when ppid is 1. */
async function portHolders(port: string): Promise<string> {
  const holders = parseLsof(await tryRun('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc']));
  if (holders.length === 0) return 'holder unknown (lsof found no listener or is missing)';
  const parts: string[] = [];
  for (const h of holders) {
    const ps = (await tryRun('ps', ['-o', 'ppid=,etime=,command=', '-p', String(h.pid)])).trim().replace(/\s+/g, ' ');
    const [ppid = '?', etime = '?', ...cmd] = ps.split(' ');
    parts.push(`pid ${String(h.pid)} (${h.command}), ppid ${ppid}${ppid === '1' ? ' ORPHAN' : ''}, up ${etime}: ${cmd.join(' ').slice(0, 160)}`);
  }
  return parts.join('; ');
}

export async function main(argv: readonly string[], env: Env = process.env): Promise<void> {
  const { port, mode, outDir: outArg, base } = parseServerArgs(argv, env);
  const timing = timingFrom(env);
  const outDir = outArg ?? e2eBuildDir(process.cwd());
  const logFile = logPathFor(env);
  const viteBin = viteBinPath(env);
  mkdirSync(dirname(logFile), { recursive: true });
  try {
    if (statSync(logFile).size > LOG_ROTATE_BYTES) renameSync(logFile, `${logFile}.1`);
  } catch {
    // no log yet
  }
  // Playwright may be gone when we write; the log file still gets every line.
  process.stdout.on('error', noop);
  process.stderr.on('error', noop);

  const log = (msg: string): void => {
    const line = `${new Date().toISOString()} [port ${port} sup ${String(process.pid)}] ${msg}\n`;
    appendFileSync(logFile, line);
    process.stderr.write(line);
  };

  const git = (args: string[]): string => {
    const r = spawnSync('git', args, { encoding: 'utf8', timeout: 5_000 });
    return r.status === 0 ? r.stdout.trim() : '';
  };
  log(`start: mode ${mode}, base ${base}, outDir ${outDir}, node ${process.version}, HEAD ${git(['rev-parse', '--short', 'HEAD']) || '?'}${git(['status', '--porcelain']) ? ' (dirty)' : ''}`);

  let child: ChildProcess | undefined;
  let stopping = false;
  let restarts = 0;
  let fastFails = 0;
  const seen = new Map<string, number>();
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
    const upSince = Date.now();
    const lastStderr: string[] = [];
    log(`preview started pid=${String(c.pid)}`);
    c.stderr.on('data', (d: Buffer) => {
      process.stderr.write(d);
      lastStderr.push(...d.toString().split('\n').filter((l) => l.trim() !== ''));
      if (lastStderr.length > STDERR_LINES) lastStderr.splice(0, lastStderr.length - STDERR_LINES);
    });
    c.on('exit', (code, signal) => {
      if (stopping || c !== child) return;
      void onExit(code, signal, Date.now() - upSince, lastStderr);
    });
  };

  const onExit = async (code: number | null, signal: NodeJS.Signals | null, uptimeMs: number, stderrLines: readonly string[]): Promise<void> => {
    const how = describeExit(code, signal);
    const cls = classifyStderr(stderrLines.join('\n'));
    const key = `${how}|${cls ?? ''}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const decision = restartDecision({ uptimeMs, fastFails, restarts, sigterm: code === 143 || signal === 'SIGTERM' }, timing);
    fastFails = decision.fastFails;
    restarts = decision.restarts;
    if (n <= 3) {
      const tail = stderrLines.slice(-6).map((l) => l.trim().slice(0, 200)).join(' | ');
      log(
        `preview EXITED unexpectedly after ${(uptimeMs / 1000).toFixed(1)} s: ${how}${cls ? `; stderr says: ${cls}` : ''}; ` +
          `index.html ${existsSync(join(outDir, 'index.html')) ? 'present' : 'MISSING'}${tail ? `; last stderr: ${tail}` : ''}`,
      );
      if (cls === 'port in use') log(`port ${port} holder: ${await portHolders(port)}`);
    } else if (n === 4) {
      log(`same failure again (${how}${cls ? `, ${cls}` : ''}); further identical exits are not logged one by one`);
    }
    if (stopping) return;
    if (decision.action === 'give up') {
      log(`gave up: ${decision.why} (${String(restarts)} restarts; ${[...seen].map(([k, v]) => `${String(v)}x ${k}`).join('; ')})`);
      process.exit(1);
    }
    restartTimer = setTimeout(() => {
      if (!stopping) start();
    }, decision.delayMs);
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
