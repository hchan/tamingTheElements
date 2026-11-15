import { describe, expect, it } from 'vitest';
import { MARK_STYLE, MARK_CAP, colorDistSq, STILL_MS, gravityDrop, markAlpha, markRimWidth, markStyleFor, stillAlpha } from './hit-mark';

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

  it('keeps every pair of element palettes far apart in colour (body and core), so marks never converge', () => {
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = MARK_STYLE[elements[i] as keyof typeof MARK_STYLE];
        const b = MARK_STYLE[elements[j] as keyof typeof MARK_STYLE];
        expect(colorDistSq(a.body, b.body), `${String(elements[i])}/${String(elements[j])} body`).toBeGreaterThan(60 * 60);
        expect(colorDistSq(a.core, b.core), `${String(elements[i])}/${String(elements[j])} core`).toBeGreaterThan(40 * 40);
      }
    }
  });

  it('puts each attacker element in its own hue family (fire orange, water blue, earth amber-brown, air white-green)', () => {
    const ch = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const [fr, fg, fb] = ch(MARK_STYLE.fire.body);
    expect(fr).toBeGreaterThan(fg + 60);
    expect(fg).toBeGreaterThan(fb);
    const [wr, wg, wb] = ch(MARK_STYLE.water.body);
    expect(wb).toBeGreaterThan(wg + 40);
    expect(wb).toBeGreaterThan(wr + 100);
    const [er, eg, eb] = ch(MARK_STYLE.earth.body);
    expect(er).toBeGreaterThan(eg);
    expect(eg).toBeGreaterThan(eb + 30);
    expect(er).toBeLessThan(fr - 40); // darker and browner than the fire orange
    const [ar, ag, ab] = ch(MARK_STYLE.air.body);
    expect(ag).toBeGreaterThan(ab);
    expect(ag).toBeGreaterThan(ar);
  });

  it('caps live marks at 12', () => {
    expect(MARK_CAP).toBe(12);
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
