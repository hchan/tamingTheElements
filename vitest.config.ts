import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
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

// Same location as src/testing/legacy/oracle.ts (not imported: configs load without TS extension resolution).
const oracleDir = process.env['TTE_ORACLE_DIR'] ?? fileURLToPath(new URL('./.oracle', import.meta.url));
const oracleAvailable = (): boolean => existsSync(resolve(oracleDir, 'war/WEB-INF/private/index.html'));

// Heavy sim, fuzz and balance tests take seconds; a loaded CI or dev machine must not turn that into a false failure.
const TEST_TIMEOUT_MS = 60_000;

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
        test: { name: 'core', environment: 'node', testTimeout: TEST_TIMEOUT_MS, include: ['src/**/*.test.ts'] },
      },
      {
        resolve: { alias },
        test: { name: 'legacy', environment: 'node', testTimeout: TEST_TIMEOUT_MS, include: ['tests/legacy/**/*.test.ts'] },
      },
      {
        // Oracle-executing characterization tests: need `pnpm oracle:restore` (legacy tree from the git tag). Without
        // .oracle/ a single skipped placeholder carries the instruction instead of 9 failing files.
        resolve: { alias },
        test: {
          name: 'oracle',
          environment: 'node',
          testTimeout: TEST_TIMEOUT_MS,
          include: oracleAvailable() ? ['tests/oracle/**/*.test.ts'] : ['tests/oracle/oracle-absent.test.ts'],
          exclude: oracleAvailable() ? ['tests/oracle/oracle-absent.test.ts'] : [],
        },
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
