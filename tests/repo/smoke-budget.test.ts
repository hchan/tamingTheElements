import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// The short gate runs only the @smoke e2e set (rules: test-gate-labels). It must stay small, single-browser and on the core path.
interface ListedSpec { title: string; file: string; line: number; tests: { projectName: string }[] }
interface ListedSuite { specs?: ListedSpec[]; suites?: ListedSuite[] }

function listSmoke(): ListedSpec[] {
  const out = execFileSync('node_modules/.bin/playwright', ['test', '--list', '--grep', '@smoke', '--reporter=json'], {
    encoding: 'utf8',
    env: { ...process.env, E2E_PORT: process.env.E2E_PORT ?? '7934' },
    maxBuffer: 16 * 1024 * 1024,
  });
  const found: ListedSpec[] = [];
  const walk = (s: ListedSuite): void => {
    found.push(...(s.specs ?? []));
    (s.suites ?? []).forEach(walk);
  };
  (JSON.parse(out) as { suites: ListedSuite[] }).suites.forEach(walk);
  return found;
}

describe('@smoke set', () => {
  const specs = listSmoke();

  it('has 10-15 tests in at most 15 files', () => {
    expect(specs.length).toBeGreaterThanOrEqual(10);
    expect(specs.length).toBeLessThanOrEqual(15);
    expect(new Set(specs.map((s) => s.file)).size).toBeLessThanOrEqual(15);
  });

  it('runs in chromium only', () => {
    for (const s of specs) expect(s.tests.map((t) => t.projectName), s.title).toEqual(['chromium']);
  });

  it('covers the core path: boot, menu, versus, online connect, phone viewport', () => {
    const files = new Set(specs.map((s) => s.file));
    for (const f of ['smoke.spec.ts', 'arcade.spec.ts', 'versus-hero-pick.spec.ts', 'online-versus.spec.ts', 'phone-layout.spec.ts', 'portrait-play.spec.ts']) {
      expect(files, f).toContain(f);
    }
  });
});
