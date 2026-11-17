import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PORTRAIT_BAR_EXT, PORTRAIT_DECK, PORTRAIT_HUD_BAND, PORTRAIT_TOP_STRIP } from '../../src/game/boot/portrait-play';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const css = readFileSync(resolve(root, 'src/ui/styles/portrait-play.css'), 'utf8');
const main = readFileSync(resolve(root, 'src/game/app/main.ts'), 'utf8');

describe('portrait play layout CSS', () => {
  it('is imported by app/main.ts', () => {
    expect(main).toContain("import '@ui/styles/portrait-play.css';");
  });
  it('pins the canvas under the strip, beating the inline CENTER_BOTH margin', () => {
    expect(css).toContain('html[data-portrait-play] #game canvas { margin-top: var(--pp-strip) !important; }');
    expect(css).toContain('--canvas-fraction: 1');
  });
  it('moves the Tour chip, and shows the one-line card', () => {
    expect(css).toContain('#tourHudStage');
    expect(css).toContain('p.firstRunOne');
  });
  it('keeps the CSS custom properties equal to the TypeScript constants', () => {
    expect(css).toContain(`--pp-strip: ${String(PORTRAIT_TOP_STRIP)}px`);
    expect(css).toContain(`--pp-bar-ext: ${String(PORTRAIT_BAR_EXT)}px`);
    expect(css).toContain(`--pp-hud: ${String(PORTRAIT_HUD_BAND)}px`);
    expect(PORTRAIT_DECK).toBe(200);
  });
  it('scopes every rule to the flag', () => {
    const rules = css.split('\n').filter((l) => l.includes('{') && !l.startsWith(':root') && !l.startsWith('/*'));
    for (const r of rules) expect(r.startsWith('html[data-portrait-play]'), r).toBe(true);
  });
});
