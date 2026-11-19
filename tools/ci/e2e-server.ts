/**
 * Playwright webServer wrapper: builds the test bundle once, then runs `vite preview` under supervision.
 * If the preview dies (a full e2e run once lost it and failed 318 tests with ERR_CONNECTION_REFUSED), the exit
 * code/signal is logged to `.scratch/e2e-server.log` and it is restarted on the same port, so tests see a brief
 * blip instead of a cascade. A health probe also restarts a preview that is alive but not answering.
 * Usage: tsx tools/ci/e2e-server.ts <port> [--mode m] [--out-dir d] [--base /b/]   (see playwright.config.ts)
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logPathFor, parseServerArgs } from './e2e-server-policy';

export function main(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): void {
  const { port, mode, outDir: outArg, base } = parseServerArgs(argv, env);
  const outDir = outArg ?? 'node_modules/.tte-e2e';
  const logFile = logPathFor(env);
  const MAX_RESTARTS = 50;
  mkdirSync(dirname(logFile), { recursive: true });

  const log = (msg: string): void => {
    const line = `${new Date().toISOString()} [port ${port}] ${msg}\n`;
    appendFileSync(logFile, line);
    process.stderr.write(line);
  };

  const pnpm = (args: string[]): string[] => ['pnpm', 'exec', ...args];
  const build = spawnSync('corepack', pnpm(['vite', 'build', '--mode', mode, '--outDir', outDir, '--base', base, '--emptyOutDir']), {
    stdio: 'inherit',
  });
  if (build.status !== 0) {
    log(`build failed status=${String(build.status)}`);
    process.exit(build.status ?? 1);
  }

  let child: ChildProcess | undefined;
  let stopping = false;
  let restarts = 0;
  let failedProbes = 0;

  const start = (): void => {
    const c = spawn('corepack', pnpm(['vite', 'preview', '--outDir', outDir, '--base', base, '--port', port, '--strictPort']), {
      stdio: 'inherit',
    });
    child = c;
    log(`preview started pid=${String(c.pid)}`);
    c.on('exit', (code, signal) => {
      if (stopping) return;
      log(`preview EXITED unexpectedly code=${String(code)} signal=${String(signal)}`);
      if (++restarts > MAX_RESTARTS) {
        log('too many restarts, giving up');
        process.exit(1);
      }
      setTimeout(start, 500);
    });
  };

  const stop = (): void => {
    stopping = true;
    child?.kill('SIGTERM');
    setTimeout(() => process.exit(0), 300);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  start();

  setInterval(() => {
    if (stopping) return;
    fetch(`http://localhost:${port}${base}`, { signal: AbortSignal.timeout(5000) })
      .then(() => {
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
  }, 5000);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('e2e-server.ts')) {
  try {
    main(process.argv.slice(2));
  } catch (e: unknown) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}
