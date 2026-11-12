import { defineConfig } from '@playwright/test';

// Smoke for the GitHub Pages layout: production build with VITE_BASE=/tamingTheElements/ served under that subpath.
// E2E_PAGES_PORT lets parallel worktrees run it side by side (default 4174).
const PORT = process.env['E2E_PAGES_PORT'] ?? process.env['E2E_PORT'] ?? '4174';

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
    command: [
      'corepack pnpm exec vite build --outDir dist-pages --emptyOutDir',
      `corepack pnpm exec vite preview --outDir dist-pages --base /tamingTheElements/ --port ${PORT} --strictPort`,
    ].join(' && '),
    env: { VITE_BASE: '/tamingTheElements/' },
    url: `http://localhost:${PORT}/tamingTheElements/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
