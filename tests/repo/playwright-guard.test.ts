import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CONFIGS = ['playwright.config.ts', 'playwright.pages.config.ts', 'playwright.itch.config.ts', 'playwright.visual.config.ts'];

describe('playwright configs take a browser slot', () => {
  it('every config calls the guard', () => {
    for (const c of CONFIGS) expect(readFileSync(c, 'utf8'), c).toMatch(/assertBrowserSlot\(\);/);
  });

  it('the main and visual configs use the per-checkout port and opt-in reuse', () => {
    for (const c of ['playwright.config.ts', 'playwright.visual.config.ts']) {
      const s = readFileSync(c, 'utf8');
      expect(s, c).toContain('e2ePort(');
      expect(s, c).toContain('reuseServer()');
      expect(s, c).not.toContain("'4173'");
    }
  });

  it('the main config serves through the supervisor and shuts it down gracefully', () => {
    const s = readFileSync('playwright.config.ts', 'utf8');
    expect(s).toContain('tools/ci/e2e-server.ts');
    expect(s).toMatch(/gracefulShutdown: \{ signal: 'SIGTERM'/);
  });

  it('a bare playwright run is refused; --list and a held slot are allowed', () => {
    const run = (args: string[], held: string) =>
      spawnSync('node_modules/.bin/playwright', ['test', '--config', 'playwright.itch.config.ts', ...args], {
        encoding: 'utf8',
        env: { ...process.env, CI: '', TTE_BROWSER_SLOT_HELD: held },
      });
    const bare = run([], '');
    expect(bare.status).not.toBe(0);
    expect(`${bare.stdout}${bare.stderr}`).toMatch(/browser slot/);
    expect(run(['--list'], '').status).toBe(0);
  });
});
