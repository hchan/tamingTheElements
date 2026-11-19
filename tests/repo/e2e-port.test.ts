import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { assertBrowserSlot, defaultE2ePort, e2eBuildDir, e2ePagesPort, e2ePort, reuseServer } from '../../tools/ci/e2e-port';

describe('e2e ports', () => {
  it('is deterministic and inside 7000-7899', () => {
    const dirs = ['/a/b/c', '/Users/x/worktrees/agent-1', '/Users/x/worktrees/agent-2', '/', 'rel/path'];
    for (const d of dirs) {
      const p = defaultE2ePort(d);
      expect(p).toBe(defaultE2ePort(d));
      expect(p).toBeGreaterThanOrEqual(7000);
      expect(p).toBeLessThanOrEqual(7899);
    }
    expect(new Set(dirs.map(defaultE2ePort)).size).toBeGreaterThan(2);
  });

  it('E2E_PORT overrides; pages is E2E_PAGES_PORT, then E2E_PORT, then default + 1', () => {
    expect(e2ePort('/x', {})).toBe(String(defaultE2ePort('/x')));
    expect(e2ePort('/x', { E2E_PORT: '7960' })).toBe('7960');
    expect(e2ePagesPort('/x', {})).toBe(String(defaultE2ePort('/x') + 1));
    expect(e2ePagesPort('/x', { E2E_PORT: '7960' })).toBe('7960');
    expect(e2ePagesPort('/x', { E2E_PORT: '7960', E2E_PAGES_PORT: '7961' })).toBe('7961');
  });

  it('server reuse is opt-in and never on CI', () => {
    expect(reuseServer({})).toBe(false);
    expect(reuseServer({ E2E_REUSE: '1' })).toBe(true);
    expect(reuseServer({ E2E_REUSE: '1', CI: 'true' })).toBe(false);
  });

  it('the guard allows a held slot, CI and --list, and otherwise throws', () => {
    expect(() => { assertBrowserSlot(['playwright', 'test'], {}); }).toThrow(/pnpm e2e/);
    expect(() => { assertBrowserSlot(['playwright', 'test'], { TTE_BROWSER_SLOT_HELD: '1' }); }).not.toThrow();
    expect(() => { assertBrowserSlot(['playwright', 'test'], { CI: 'true' }); }).not.toThrow();
    expect(() => { assertBrowserSlot(['playwright', 'test', '--list'], {}); }).not.toThrow();
  });
});

describe('e2eBuildDir', () => {
  it('differs per worktree git dir, so a shared node_modules no longer shares the build', () => {
    const gitDirs: Record<string, string> = { '/w/a': '/r/.git/worktrees/a', '/w/b': '/r/.git/worktrees/b' };
    const of = (c: string): string | undefined => gitDirs[c];
    expect(e2eBuildDir('/w/a', of)).toBe('/r/.git/worktrees/a/tte-e2e-build');
    expect(e2eBuildDir('/w/b', of)).toBe('/r/.git/worktrees/b/tte-e2e-build');
  });

  it('falls back to node_modules/.tte-e2e outside a git checkout', () => {
    expect(e2eBuildDir('/x/y', () => undefined)).toBe(join(resolve('/x/y'), 'node_modules', '.tte-e2e'));
  });

  it('in this checkout it lives inside `git rev-parse --git-dir`', () => {
    const g = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-dir'], { encoding: 'utf8' }).stdout.trim();
    expect(e2eBuildDir(process.cwd())).toBe(join(g, 'tte-e2e-build'));
  });
});
