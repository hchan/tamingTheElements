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
