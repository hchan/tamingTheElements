import { defineConfig } from '@playwright/test';
import { assertBrowserSlot, e2ePort, reuseServer } from './tools/ci/e2e-port';

assertBrowserSlot();

// E2E_PORT overrides the per-checkout default port (tools/ci/e2e-port.ts), so worktrees run side by side.
const PORT = e2ePort(process.cwd());

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60_000, // software-rendered CI runners are slower than a local GPU
  // CI only: one retry, with a trace. A pass-after-retry is reported as flaky by Playwright; never hide it (docs/TESTING.md).
  // TTE_E2E_RETRIES overrides it (the router sets 1 for the PC short lane); a flaky pass is still listed as flaky.
  retries: Number(process.env['TTE_E2E_RETRIES'] ?? (process.env.CI ? 1 : 0)),
  expect: { timeout: 10_000 }, // default 5 s is tight for SwiftShader first paint; assertions poll, so passes stay fast
  reporter: [['list'], ['html', { open: 'never' }], ['./tools/ci/e2e-reporter.ts']], // the last one writes results.jsonl and report.md (docs/TESTING.md)
  use: {
    baseURL: `http://localhost:${PORT}`,
    actionTimeout: 30_000, // also bounds waitForFunction: a cold Phaser chunk load on a loaded machine can pass 15 s; still fails with a clear message before the 60 s test timeout
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    launchOptions: {
      // SwiftShader software WebGL; never --disable-gpu.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // tools/ci/e2e-server.ts builds with `--mode test` (compiles in window.__TTE__; production builds never contain it), then runs
    // `vite preview` supervised: a dead server is logged to .scratch/e2e-server.log and restarted (ideas/done/e2e-webserver-health.md).
    command: `corepack pnpm exec tsx tools/ci/e2e-server.ts ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: reuseServer(), // opt-in (E2E_REUSE=1): silent reuse caused cross-run contamination
    timeout: 120_000,
    // A normal teardown SIGTERMs the group: the supervisor stops vite and writes `stop: SIGTERM`; Playwright SIGKILLs the group after 5 s.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
