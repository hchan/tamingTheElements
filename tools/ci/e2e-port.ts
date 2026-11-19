// Per-checkout e2e ports and the browser-slot guard shared by the Playwright configs (see docs/TESTING.md).
// 7000-7899 is derived from the checkout directory; 7900-7999 stays free for QA and manual use (the PC uses 7960).
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

export const PORT_BASE = 7000;
export const PORT_SPAN = 900;

type Env = Readonly<Record<string, string | undefined>>;

/** 32-bit FNV-1a of a string (unsigned). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic port in 7000-7899 for a checkout directory. */
export function defaultE2ePort(dir: string): number {
  return PORT_BASE + (fnv1a(resolve(dir)) % PORT_SPAN);
}

/** Main/visual config port: E2E_PORT, else the per-checkout default. */
export function e2ePort(dir: string, env: Env = process.env): string {
  return env['E2E_PORT'] ?? String(defaultE2ePort(dir));
}

/** Pages config port: E2E_PAGES_PORT, else E2E_PORT, else default + 1. */
export function e2ePagesPort(dir: string, env: Env = process.env): string {
  return env['E2E_PAGES_PORT'] ?? env['E2E_PORT'] ?? String(defaultE2ePort(dir) + 1);
}

/** Server reuse is opt-in (E2E_REUSE=1) and never on CI. */
export function reuseServer(env: Env = process.env): boolean {
  return !env['CI'] && env['E2E_REUSE'] === '1';
}

/**
 * Throws unless the run holds a browser slot (tools/ci/browser-slot.ts), is on CI, or only lists tests.
 * Stops `pnpm exec playwright test` from bypassing the slot limit.
 */
export function assertBrowserSlot(argv: readonly string[] = process.argv, env: Env = process.env): void {
  if (env['CI'] || env['TTE_BROWSER_SLOT_HELD'] === '1' || argv.includes('--list')) return;
  throw new Error('Playwright must run inside a browser slot: run `pnpm e2e -- <args>` (takes a browser slot), not `pnpm exec playwright test`.');
}

/** The checkout's own git admin directory (absolute), or undefined outside a git checkout. Each worktree has its own. */
export function gitDirOf(cwd: string): string | undefined {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-dir'], { cwd, encoding: 'utf8' });
  const out = r.status === 0 ? r.stdout.trim() : '';
  return out ? resolve(cwd, out) : undefined;
}

/**
 * Where the e2e test bundle is built: `<git-dir>/tte-e2e-build`. A worktree's node_modules may be a symlink to the main
 * checkout's, so a directory under node_modules would be shared by every checkout and one run's `--emptyOutDir` would delete
 * files under another run's preview. Outside a git checkout: node_modules/.tte-e2e.
 */
export function e2eBuildDir(cwd: string, gitDir: (cwd: string) => string | undefined = gitDirOf): string {
  const g = gitDir(cwd);
  return g ? join(g, 'tte-e2e-build') : join(resolve(cwd), 'node_modules', '.tte-e2e');
}
