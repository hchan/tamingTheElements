import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// qa-r119 N1: the first-fight card must stay readable over the floor: solid backing, >= 7:1 text, >= 16px at 720p.
const css = readFileSync(resolve(__dirname, '../../src/ui/styles/main/09-help-first-run.css'), 'utf8');
const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
};
const block = css.slice(css.indexOf('.firstRunHint {'), css.indexOf('.firstRunWait {'));

describe('first-run card CSS', () => {
  it('has a solid backing and at least 7:1 text contrast', () => {
    const bg = /background:\s*(#[0-9a-f]{6})\s*;/i.exec(block)?.[1];
    const fg = /color:\s*(#[0-9a-f]{6})\s*;/i.exec(block)?.[1];
    expect(bg).toBeDefined();
    expect(fg).toBeDefined();
    const [a, b] = [lum(bg ?? '#000000'), lum(fg ?? '#000000')].sort((x, y) => y - x) as [number, number];
    expect((a + 0.05) / (b + 0.05)).toBeGreaterThanOrEqual(7);
  });
  it('is at least 16px at base and in the 720p strip', () => {
    expect(/font-size:\s*clamp\(16px/.test(block)).toBe(true);
    const mq = css.slice(css.indexOf('@media (min-height: 501px) and (max-height: 800px)'));
    expect(/font-size:\s*16px/.test(mq.slice(0, mq.indexOf('@media (max-height: 500px)')))).toBe(true);
  });
});
