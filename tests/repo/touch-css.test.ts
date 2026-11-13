import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../../src/ui/styles/main.css'), 'utf8');

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
