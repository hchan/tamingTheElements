import { describe, expect, it } from 'vitest';
import { readMainCss } from './css-source';

const css = readMainCss().replace(/\/\*[\s\S]*?\*\//g, '');

describe('desktop hero picker at 1920x1080 (qa-r46 #3)', () => {
  const block = /@media \(min-width: 1600px\) and \(min-height: 900px\) and \(pointer: fine\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  it('has a wide-window rule that is mouse-only', () => {
    expect(block.length).toBeGreaterThan(0);
  });
  it('widens the Versus page past the 80em cap and grows the tile face above 48px', () => {
    expect(block).toMatch(/#menu #arcadePick\s*\{[^}]*max-width:\s*min\(96vw,\s*108em\)/);
    const face = /\.heroTileFace\s*\{[^}]*width:\s*(\d+)px/.exec(block);
    expect(Number(face?.[1])).toBeGreaterThan(48);
  });
});

describe('wide-window tile rules stay out of the Tour picker (tour names clipped at 1920x1080)', () => {
  const block = /@media \(min-width: 1600px\) and \(min-height: 900px\) and \(pointer: fine\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  it('scopes every tile selector to #arcadePick', () => {
    const selectors = [...block.matchAll(/(^|\})\s*([^{}]+)\{/g)].map((m) => (m[2] ?? '').trim());
    const tile = selectors.filter((s) => /heroGrid|heroTile/.test(s));
    expect(tile.length).toBeGreaterThanOrEqual(4);
    for (const s of tile) expect(s).toMatch(/^#arcadePick /);
  });
});
