import { defineConfig } from '@playwright/test';

// Smoke for the itch.io artifact: run `pnpm build:itch` first; the spec unzips dist-itch/*.zip and serves it at the root.
export default defineConfig({
  testDir: 'tests/e2e-itch',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
