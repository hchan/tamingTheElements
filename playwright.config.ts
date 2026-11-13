import { defineConfig } from '@playwright/test';

// E2E_PORT lets parallel worktrees run the suite side by side.
const PORT = process.env['E2E_PORT'] ?? '4173';

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60_000, // software-rendered CI runners are slower than a local GPU
  // CI only: one retry, with a trace. A pass-after-retry is reported as flaky by Playwright; never hide it (docs/TESTING.md).
  retries: process.env.CI ? 1 : 0,
  expect: { timeout: 10_000 }, // default 5 s is tight for SwiftShader first paint; assertions poll, so passes stay fast
  reporter: [['list'], ['html', { open: 'never' }]],
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
    // `--mode test` compiles in the window.__TTE__ hook; production builds never contain it.
    command: `corepack pnpm exec vite build --mode test --outDir node_modules/.tte-e2e --emptyOutDir && corepack pnpm exec vite preview --outDir node_modules/.tte-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
