import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/styles/main.css', 'utf8');

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('--color-water', () => {
  const short = /--color-water:\s*#([0-9a-f]{3});/i.exec(css)?.[1];
  const water = short === undefined ? undefined : `#${short.replace(/./g, (d) => d + d)}`;
  it('is a hex colour with WCAG AA text contrast on the dark menu backgrounds', () => {
    expect(water).toBeDefined();
    for (const bg of ['#000000', '#1b1030']) expect(ratio(water ?? '#0000ff', bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('touch target sizes', () => {
  it('keeps the 44 px coarse floor on Back/Help links and 48 px on touch buttons', () => {
    const coarse = css.slice(css.indexOf('Touch devices: every tap target'));
    expect(coarse.slice(0, 500)).toContain('#menu a.menuLink');
    expect(css).toMatch(/#menu button\.touchBtn \{[^}]*min-height: 48px;/);
  });
});
