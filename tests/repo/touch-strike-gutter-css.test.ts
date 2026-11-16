import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const css = readFileSync(resolve(root, 'src/ui/styles/touch-strike-gutter.css'), 'utf8');
const main = readFileSync(resolve(root, 'src/ui/styles/main.css'), 'utf8');
const ts = readFileSync(resolve(root, 'src/game/app/touch-strike.ts'), 'utf8');

describe('PHONE-2 Strike gutter CSS (640-739 px landscape phones)', () => {
  it('applies to coarse landscape phones 640 to 739.98 wide, at most 500 tall', () => {
    expect(css).toContain('@media (pointer: coarse) and (min-width: 640px) and (max-width: 739.98px) and (max-height: 500px) and (orientation: landscape)');
  });
  it('is contiguous with PHONE-1 in main.css, which starts at 740 px', () => {
    expect(main).toContain('min-width: 740px');
  });
  it('scopes every rule to right-handed play', () => {
    const rules = css.split('\n').filter((l) => l.includes('{') && !l.startsWith('@media') && !l.startsWith('/*'));
    expect(rules.length).toBeGreaterThan(4);
    for (const r of rules) expect(r.trim().startsWith("html:not([data-touch-side='left'])"), r).toBe(true);
  });
  it('uses a 52 px gutter and 44 px Strikes (52 >= 44 + 8)', () => {
    expect(css).toContain('--strike-gutter: 52px');
    expect(css).toContain('.touchStrike { width: 44px; height: 44px; }');
  });
  it('puts the Strikes and the fullscreen toggle in the gutter', () => {
    expect(css).toContain('right: calc(8px - var(--strike-gutter))');
    expect(css).toContain('#fullscreenToggle { right: calc(6px - var(--strike-gutter)); }');
  });
  it('is imported by touch-strike.ts', () => {
    expect(ts).toContain("import '@ui/styles/touch-strike-gutter.css';");
  });
});
