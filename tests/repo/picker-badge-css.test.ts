import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readMainCss } from './css-source';

const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '');
const css = strip(readMainCss());
const stack = strip(readFileSync(resolve(import.meta.dirname, '../../src/ui/styles/team-stack.css'), 'utf8'));

describe('picker tile badges and stack stats (QA: "Fiara You 3 You", "Speed / 7" wrap)', () => {
  it('pick and cursor badges are absolutely positioned on every .heroTile (Versus and World Tour), out of the name flow', () => {
    expect(css).toMatch(/\.heroTile \.vsFlags,\s*\.heroTile \.vsCursors\s*\{[^}]*position:\s*absolute/);
  });
  it('World Tour tiles get the chip look too (rules not scoped to #arcadePick only)', () => {
    expect(css).toMatch(/\.heroTile \.vsChip/);
  });
  it('.tsStats stays on one line without a bigger font', () => {
    const rule = /\.teamStack \.tsStats\s*\{([^}]*)\}/.exec(stack)?.[1] ?? '';
    expect(rule).toMatch(/white-space:\s*nowrap/);
    expect(rule).toMatch(/font-size:\s*0\.8em/);
  });
});
