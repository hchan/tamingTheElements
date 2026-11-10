import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const src = (dir: string): string => fileURLToPath(new URL(dir, import.meta.url));

const alias = {
  '@core': src('./src/core'),
  '@game': src('./src/game'),
  '@ui': src('./src/ui'),
  '@testing': src('./src/testing'),
  '@fixtures': src('./tests/fixtures'),
};

// Heavy sim, fuzz and balance tests take seconds; a loaded CI or dev machine must not turn that into a false failure.
const TEST_TIMEOUT_MS = 60_000;

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/core/**'],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
    },
    projects: [
      {
        resolve: { alias },
        test: { name: 'core', environment: 'node', testTimeout: TEST_TIMEOUT_MS, include: ['src/**/*.test.ts'] },
      },
      {
        resolve: { alias },
        test: { name: 'legacy', environment: 'node', testTimeout: TEST_TIMEOUT_MS, include: ['tests/legacy/**/*.test.ts'] },
      },
      {
        resolve: { alias },
        test: { name: 'repo', environment: 'node', testTimeout: TEST_TIMEOUT_MS, include: ['tests/{repo,lint}/**/*.test.ts'] },
      },
      {
        resolve: { alias },
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            screenshotFailures: false,
            provider: playwright(),
            instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
          },
        },
      },
    ],
  },
});
