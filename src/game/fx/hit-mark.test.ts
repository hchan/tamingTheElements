import { describe, expect, it } from 'vitest';
import { MARK_STYLE, STILL_MS, gravityDrop, markAlpha, markRimWidth, markStyleFor, stillAlpha } from './hit-mark';

describe('element hit marks', () => {
  const elements = Object.keys(MARK_STYLE) as (keyof typeof MARK_STYLE)[];

  it('gives every element its own shape and colours, none of them plain white', () => {
    expect(new Set(elements.map((e) => MARK_STYLE[e].shape)).size).toBe(elements.length);
    expect(new Set(elements.map((e) => MARK_STYLE[e].body)).size).toBe(elements.length);
    for (const e of elements) {
      expect(MARK_STYLE[e].core).not.toBe(0xffffff);
      expect(MARK_STYLE[e].body).not.toBe(0xffffff);
    }
  });

  it('looks styles up and returns undefined without an element', () => {
    expect(markStyleFor('fire')?.shape).toBe('flare');
    expect(markStyleFor(undefined)).toBeUndefined();
  });

  it('fire rises, water and earth fall, air stays level', () => {
    expect(gravityDrop(MARK_STYLE.fire.gravity, 1)).toBeLessThan(0);
    expect(gravityDrop(MARK_STYLE.water.gravity, 1)).toBeGreaterThan(0);
    expect(gravityDrop(MARK_STYLE.earth.gravity, 1)).toBeGreaterThan(0);
    expect(gravityDrop(MARK_STYLE.air.gravity, 1)).toBe(0);
  });

  it('holds the still mark then fades it, and ends it', () => {
    expect(stillAlpha(0)).toBe(1);
    expect(stillAlpha(STILL_MS * 0.5)).toBe(1);
    expect(stillAlpha(STILL_MS * 0.8)).toBeCloseTo(0.5, 5);
    expect(stillAlpha(STILL_MS)).toBe(0);
    expect(stillAlpha(-1)).toBe(0);
    expect(stillAlpha(Number.NaN)).toBe(0);
  });

  it('boosts alpha and rim under high contrast, never above 1', () => {
    expect(markAlpha(0.5, true)).toBeGreaterThan(markAlpha(0.5, false));
    expect(markAlpha(0.9, true)).toBe(1);
    expect(markAlpha(-1, false)).toBe(0);
    expect(markRimWidth(4, true)).toBe(8);
    expect(markRimWidth(4, false)).toBe(4);
  });
});
