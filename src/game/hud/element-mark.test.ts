import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '@core/index';
import { elementCue } from './bars';
import { elementMark } from './element-mark';

describe('elementMark', () => {
  it('gives every element a different silhouette (never colour alone)', () => {
    const shapes = ELEMENTS.map((e) => JSON.stringify(elementMark(e, 6)));
    expect(new Set(shapes).size).toBe(ELEMENTS.length);
  });
  it('stays within its radius so it fits the chip', () => {
    for (const e of ELEMENTS) {
      const m = elementMark(e, 6);
      const nums = m.kind === 'poly' ? m.pts : m.kind === 'lines' ? m.runs.flat() : [m.r];
      for (const n of nums) expect(Math.abs(n)).toBeLessThanOrEqual(6);
    }
  });
  it('void is hollow, unlike every other filled polygon', () => {
    const m = elementMark('void', 8);
    expect(m.kind === 'poly' && m.hole?.length).toBeGreaterThan(0);
    for (const e of ELEMENTS.filter((x) => x !== 'void')) {
      const o = elementMark(e, 8);
      expect(o.kind === 'poly' ? o.hole : undefined).toBeUndefined();
    }
  });
  it('the word cue carries a glyph for each element too', () => {
    for (const e of ELEMENTS) expect(elementCue(e)).toMatch(/^\S+ [A-Z]/);
  });
});
