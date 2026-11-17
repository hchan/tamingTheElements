/**
 * Playwright webServer wrapper: builds the test bundle once, then runs `vite preview` under supervision.
 * If the preview dies (a full e2e run once lost it and failed 318 tests with ERR_CONNECTION_REFUSED), the exit
 * code/signal is logged to `.scratch/e2e-server.log` and it is restarted on the same port, so tests see a brief
 * blip instead of a cascade. A health probe also restarts a preview that is alive but not answering.
 * Usage: tsx tools/ci/e2e-server.ts <port>   (see playwright.config.ts)
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';

const port = process.argv[2] ?? process.env['E2E_PORT'] ?? '4173';
const outDir = 'node_modules/.tte-e2e';
const logFile = '.scratch/e2e-server.log';
const MAX_RESTARTS = 50;
mkdirSync('.scratch', { recursive: true });

function log(msg: string): void {
  const line = `${new Date().toISOString()} [port ${port}] ${msg}\n`;
  appendFileSync(logFile, line);
  process.stderr.write(line);
}

const pnpm = (args: string[]): string[] => ['pnpm', 'exec', ...args];
const build = spawnSync('corepack', pnpm(['vite', 'build', '--mode', 'test', '--outDir', outDir, '--emptyOutDir']), {
  stdio: 'inherit',
});
if (build.status !== 0) {
  log(`build failed status=${build.status}`);
  process.exit(build.status ?? 1);
}

let child: ChildProcess | undefined;
let stopping = false;
let restarts = 0;
let failedProbes = 0;

function start(): void {
  const c = spawn('corepack', pnpm(['vite', 'preview', '--outDir', outDir, '--port', port, '--strictPort']), {
    stdio: 'inherit',
  });
  child = c;
  log(`preview started pid=${c.pid}`);
  c.on('exit', (code, signal) => {
    if (stopping) return;
    log(`preview EXITED unexpectedly code=${code} signal=${signal}`);
    if (++restarts > MAX_RESTARTS) {
      log('too many restarts, giving up');
      process.exit(1);
    }
    setTimeout(start, 500);
  });
}

function stop(): void {
  stopping = true;
  child?.kill('SIGTERM');
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

start();

setInterval(() => {
  if (stopping) return;
  fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(5000) })
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
