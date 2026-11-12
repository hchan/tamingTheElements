import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../../src/ui/styles/main.css'), 'utf8');

describe('touch button layout CSS', () => {
  it('keys layout off the data attributes, not the primary pointer, so hybrids and overrides work', () => {
    expect(css).toContain("html[data-touch-size='compact'] button.touchBtn");
    expect(css).toContain("html[data-touch-side='left'] button.touchBtn");
    expect(css).toContain("html[data-touch-size='large'][data-touch-side='left'] #menu button.touchBtn");
    expect(css).not.toMatch(/@media \(pointer: fine\)/);
    expect(css).not.toMatch(/@media \(pointer: coarse\) and \(max-height/);
  });
});
