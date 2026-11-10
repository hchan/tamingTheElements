import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = (dir: string): string => fileURLToPath(new URL(dir, import.meta.url));

/** Short git sha of HEAD; GITHUB_SHA when git metadata is absent; `unknown` otherwise. */
function shortSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: src('.'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 7) ?? 'unknown';
  }
}

const pkg = JSON.parse(readFileSync(src('./package.json'), 'utf8')) as { version: string };

export default defineConfig({
  // Pages serves under /tamingTheElements/ (set VITE_BASE there); everything else is served from the root.
  base: process.env.VITE_BASE ?? '/',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.VITE_APP_COMMIT': JSON.stringify(shortSha()),
  },
  resolve: {
    alias: {
      '@core': src('./src/core'),
      '@game': src('./src/game'),
      '@ui': src('./src/ui'),
      '@testing': src('./src/testing'),
      '@fixtures': src('./tests/fixtures'),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          return id.includes('node_modules/phaser') ? 'phaser' : undefined;
        },
      },
    },
  },
});
