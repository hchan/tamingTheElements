import { defineConfig } from '@playwright/test';

// E2E_PORT lets parallel worktrees run the suite side by side.
const PORT = process.env['E2E_PORT'] ?? '4173';

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  retries: process.env.CI ? 1 : 0, // a pass-after-retry is reported as flaky by Playwright; never hide it
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: {
      // SwiftShader software WebGL; never --disable-gpu.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // `--mode test` compiles in the window.__TTE__ hook; production builds never contain it.
    command: `corepack pnpm exec vite build --mode test && corepack pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
