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

/**
 * The deterministic sim, agents, replay code and the match recorder form their own `sim` chunk: the main menu is
 * Phaser-free and needs none of it, so it is loaded by dynamic import when a match or replay starts (and prefetched
 * once the menu is idle). See docs/PERFORMANCE.md.
 */
const SIM_CHUNK = /\/src\/(core\/(sim|agents|replay|net)\/|game\/replay\/playtest-recorder)/;

/** Data, rules, save and rng: needed by the menu and by the sim, so they get a stable shared chunk (not a content-named one). */
const CORE_CHUNK = /\/src\/core\/(data|rules|save|rng|math|flags|version|tester\/save-edits)/;

const pkg =JSON.parse(readFileSync(src('./package.json'), 'utf8')) as { version: string };

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
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'phaser', test: /node_modules[\\/]phaser/ },
            { name: 'core', test: CORE_CHUNK },
            { name: 'sim', test: SIM_CHUNK },
            // The Arcade defence view: the lazy round-view chunk imports it statically, but it stays its own chunk (and
            // budget); its own imports stay where they are (the shared colours and viewport in the phaser-config chunk).
            { name: 'defence-view', test: /\/src\/game\/fx\/defence-/, includeDependenciesRecursively: false },
            // The Arcade weather view, the same way (WP-arcade-weather-view).
            { name: 'weather-view', test: /\/src\/game\/fx\/weather-/, includeDependenciesRecursively: false },
            // The Arcade terrain view (WP-arcade-terrain-view), mounted by the Arena in every Arcade match.
            { name: 'terrain-view', test: /\/src\/game\/fx\/terrain-/, includeDependenciesRecursively: false },
            // The procedural pose layer, mounted by the Arena once the match scene is up (WP-arcade-pose-layer).
            { name: 'pose-layer', test: /\/src\/game\/views\/pose-/, includeDependenciesRecursively: false },
            // The Arcade clash burst, mounted by the defence view (WP-arcade-clash).
            { name: 'clash-view', test: /\/src\/game\/fx\/clash-/, includeDependenciesRecursively: false },
            // The Arcade tag-team view, mounted by the weather view (WP-arcade-tag-view).
            { name: 'tag-view', test: /\/src\/game\/hud\/tag-/, includeDependenciesRecursively: false },
          ],
        },
      },
    },
  },
});
