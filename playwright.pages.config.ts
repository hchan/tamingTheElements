import { defineConfig } from '@playwright/test';

// Smoke for the GitHub Pages layout: production build with VITE_BASE=/tamingTheElements/ served under that subpath.
const PORT = '4174';

export default defineConfig({
  testDir: 'tests/e2e-pages',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}` },
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
