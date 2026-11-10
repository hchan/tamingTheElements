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

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/core/**'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // Measured 2026-11: lines 95.5, statements 94.0, functions 94.9, branches 72.9. Floors are measured minus ~3 points.
      // Raise them when coverage improves; never lower without a reason in the PR. See docs/TESTING.md.
      thresholds: { lines: 92, functions: 91, branches: 69, statements: 91 },
    },
    projects: [
      {
        resolve: { alias },
        test: { name: 'core', environment: 'node', include: ['src/**/*.test.ts'] },
      },
      {
        resolve: { alias },
        test: { name: 'legacy', environment: 'node', include: ['tests/legacy/**/*.test.ts'] },
      },
      {
        resolve: { alias },
        test: { name: 'repo', environment: 'node', include: ['tests/{repo,lint}/**/*.test.ts'] },
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
