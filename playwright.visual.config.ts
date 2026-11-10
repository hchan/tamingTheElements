import { defineConfig } from '@playwright/test';

// Visual QA pipeline (docs/VISUAL-QA.md): screenshots, videos, regression baselines and the frame-pacing probe.
// E2E_PORT lets parallel worktrees run side by side.
const PORT = process.env['E2E_PORT'] ?? '4173';

const launchOptions = {
  // SwiftShader software WebGL; never --disable-gpu.
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
};

export default defineConfig({
  testDir: 'tests/visual',
  // Playwright wipes outputDir on every run; the deliverables go to test-results/visual/ (outside it) on purpose.
  outputDir: 'test-results/visual-run',
  // Linux baselines are the source of truth for CI. Other platforms have their own (git-ignored) folders.
  snapshotPathTemplate: '{testDir}/__baselines__/{platform}/{projectName}/{arg}{ext}',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  expect: {
    toHaveScreenshot: {
      // Same-machine SwiftShader output is near identical; allow a little text anti-aliasing noise.
      maxDiffPixelRatio: 0.005,
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions,
    reducedMotion: 'no-preference',
  },
  projects: [
    { name: 'capture', testMatch: /capture\.spec\.ts/, use: { browserName: 'chromium' } },
    { name: 'regression', testMatch: /regression\.spec\.ts/, use: { browserName: 'chromium' } },
    { name: 'videos', testMatch: /videos\.spec\.ts/, use: { browserName: 'chromium' } },
    { name: 'pacing', testMatch: /pacing\.spec\.ts/, use: { browserName: 'chromium' } },
  ],
  webServer: {
    // `--mode test` compiles in the window.__TTE__ hook; production builds never contain it.
    command: `corepack pnpm exec vite build --mode test && corepack pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
