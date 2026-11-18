import { describe, expect, it } from 'vitest';
import { assertBrowserSlot, defaultE2ePort, e2ePagesPort, e2ePort, reuseServer } from '../../tools/ci/e2e-port';

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
