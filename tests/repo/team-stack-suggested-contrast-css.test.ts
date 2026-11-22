import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const css = readFileSync(resolve(root, 'src/ui/styles/team-stack.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}
function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('World Tour / Versus suggested stack rows are easy to read (a11y review #8, #12)', () => {
  const m = /\.tsSuggested \.tsName,\s*\.teamStack \.tsSuggested \.tsStats \{([^}]*)\}/.exec(css);
  const color = /color:\s*(#[0-9a-f]{6})/i.exec(m?.[1] ?? '')?.[1] ?? '';
  it('suggested name and stats keep 7:1 on the darkest and the highlighted row background', () => {
    expect(color).not.toBe('');
    expect(ratio(color, '#1c1826')).toBeGreaterThanOrEqual(7);
    expect(ratio(color, '#3a2f22')).toBeGreaterThanOrEqual(7);
  });
  it('suggested text is not dimmed by opacity', () => {
    expect(m?.[1]).toMatch(/opacity:\s*1/);
  });
});
