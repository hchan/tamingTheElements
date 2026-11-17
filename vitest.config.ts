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

// Heavy sim, fuzz and balance tests take seconds alone (slowest: fun-gate ~17 s and weather property ~5 s when all 263 files
// run in parallel). With several agents on the same machine the 13 vitest workers get a small slice of the CPU and those
// stretch 10x or more past the old 60 s, then fail although they pass alone. The timeout only guards against hangs, so it is
// generous; it asserts nothing. (Wall-clock assertions in tests/repo/sim-perf.test.ts are separate and use medians/minimums.)
const TEST_TIMEOUT_MS = 240_000;

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/ui/**', 'src/game/**'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // Measured 2026-11: lines 95.5, statements 94.0, functions 94.9, branches 72.9. Floors are measured minus ~3 points.
      // Raise them when coverage improves; never lower without a reason in the PR. See docs/TESTING.md.
      thresholds: {
        'src/core/**': { lines: 92, functions: 91, branches: 69, statements: 91 },
        // src/ui and src/game (DOM + non-Phaser logic; Phaser scenes count as uncovered, they are e2e territory).
        // Measured 2026-11-16 with the core + dom projects: ui lines 95.7, functions 89.3, branches 80.2, statements 94.0;
        // game lines 70.9, functions 71.1, branches 66.1, statements 69.5. Floors are measured minus ~4-5 points.
        'src/ui/**': { lines: 91, functions: 85, branches: 75, statements: 90 },
        'src/game/**': { lines: 66, functions: 66, branches: 61, statements: 65 },
      },
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'core',
          environment: 'node',
          testTimeout: TEST_TIMEOUT_MS,
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.dom.test.ts'],
        },
      },
      {
        // DOM unit tests for src/ui and src/game (menus, pause dialog, touch controls): happy-dom, `*.dom.test.ts` next to the code.
        resolve: { alias },
        test: { name: 'dom', environment: 'happy-dom', testTimeout: TEST_TIMEOUT_MS, include: ['src/**/*.dom.test.ts'] },
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
