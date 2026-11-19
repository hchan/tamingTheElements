import { describe, expect, it } from 'vitest';
import { readMainCss } from './css-source';

const css = readMainCss();

describe('touch button overlay CSS', () => {
  it('places buttons as transparent absolute overlays over the canvas boxes, never docked to the right', () => {
    const block = css.slice(css.indexOf('button.touchBtn,'), css.indexOf('button.touchBtn:focus-visible'));
    expect(block).toContain('position: absolute');
    expect(block).toContain('visibility: hidden');
    expect(block).toContain('background: transparent');
    expect(block).toMatch(/min-width: 48px;\s*min-height: 48px;/);
    expect(block).not.toMatch(/right:/);
    expect(css).not.toContain("data-touch-side='right'] button.touchBtn");
  });
});

describe('first-run card vs the action bar', () => {
  it('sits above the action bar (80/720 of the canvas) in the 720p block', () => {
    const start = css.indexOf('@media (min-height: 501px) and (max-height: 800px) {');
    const block = css.slice(start, css.indexOf('@media (max-height: 500px)', start));
    const m = /\.firstRunHint:not\(\.firstRunWait\) \{[^}]*bottom: calc\(([\d.]+)% \+ (\d+)px\)/.exec(block);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(11.11);
    expect(Number(m?.[2])).toBeGreaterThanOrEqual(8);
  });
});
