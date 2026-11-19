import { defineConfig } from '@playwright/test';
import { assertBrowserSlot, e2ePagesPort } from './tools/ci/e2e-port';

assertBrowserSlot();

// Smoke for the GitHub Pages layout: production build with VITE_BASE=/tamingTheElements/ served under that subpath.
// E2E_PAGES_PORT, else E2E_PORT, else the per-checkout default + 1 (tools/ci/e2e-port.ts).
const PORT = e2ePagesPort(process.cwd());

export default defineConfig({
  testDir: 'tests/e2e-pages',
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0, // CI only; a pass-after-retry is reported as flaky, never hidden
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // Same supervisor as the main suite (tools/ci/e2e-server.ts): logged exits, restarts, no orphans. dist-pages stays: deploy:pages reads it.
    command: `corepack pnpm exec tsx tools/ci/e2e-server.ts ${PORT} --mode production --out-dir dist-pages --base /tamingTheElements/`,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    env: { VITE_BASE: '/tamingTheElements/' },
    url: `http://localhost:${PORT}/tamingTheElements/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
