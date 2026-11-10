import { fileURLToPath } from 'node:url';
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
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
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
    ],
  },
});
