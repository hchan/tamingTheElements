import { describe, expect, it } from 'vitest';
import { SUPER_NAMES } from '@core/index';
import { LANDSCAPE_WINDOW, NAME_SAFE_W, bandExt, bandWindow, bandHidesWeather, fitTitlePx, nameHalfWidth, portraitRect, portraitSide, superBandSlot, superName, sweptSpan, type Rect, type Span } from './super-view';

describe('superName', () => {
  it('names every super id from the data table, each distinct and non-empty', () => {
    expect(SUPER_NAMES.length).toBeGreaterThan(1);
    SUPER_NAMES.forEach((n, id) => {
      expect(superName(id)).toBe(n);
    });
    expect(new Set(SUPER_NAMES).size).toBe(SUPER_NAMES.length);
    expect(SUPER_NAMES.every((n) => n.trim().length > 0)).toBe(true);
  });

  it('falls back to the generic name for an unknown id (never undefined or blank)', () => {
    for (const id of [-1, SUPER_NAMES.length, 9999, Number.NaN]) expect(superName(id)).toBe(superName(0));
  });
});

describe('fitTitlePx', () => {
  it('keeps a title that fits and shrinks a wide one to the safe width', () => {
    expect(fitTitlePx(72, NAME_SAFE_W - 1, NAME_SAFE_W)).toBe(72);
    const px = fitTitlePx(72, NAME_SAFE_W * 1.5, NAME_SAFE_W);
    expect(px).toBeLessThan(72);
    expect(px).toBeGreaterThanOrEqual(29);
    expect(fitTitlePx(72, NAME_SAFE_W * 100, NAME_SAFE_W)).toBe(29);
  });
  it('leaves room beside both portrait cards', () => {
    expect(NAME_SAFE_W).toBeGreaterThan(700);
    expect(NAME_SAFE_W).toBeLessThan(1000);
  });
});

const sp = (top: number, bottom: number, w: number): Span => ({ top, bottom, w });
const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });

describe('super band slot', () => {
  it('bandExt is half the band plus half a rule', () => {
    [1, 0.85, 0.7, 0.6].forEach((k, i) => { expect(bandExt(k)).toBeCloseTo([83, 71, 59, 51][i] as number, 6); });
  });
  it('sweptSpan covers the punch-in about the anchor, with head and feet pads', () => {
    expect(sweptSpan(250 - 10.8, 430 + 6.3, 340, 1.15, 3)).toEqual({ top: 212, bottom: 475, w: 3 });
    expect(sweptSpan(270, 450, 340, 1.15, 1)).toEqual({ top: 247, bottom: 491, w: 1 });
    // reduced motion (z 1): just the pads
    expect(sweptSpan(200, 424, 300, 1, 1)).toEqual({ top: 188, bottom: 448, w: 1 });
  });
  it('finds a clear slot between close fighters', () => {
    const s = superBandSlot([sp(212, 475, 3), sp(247, 491, 1)], [], -1);
    expect(s).toMatchObject({ k: 0.6, y: 542, cost: 0 });
  });
  it('keeps the caster clear when the foe is high and the caster low', () => {
    const s = superBandSlot([sp(120, 320, 1), sp(400, 640, 3)], [], 1);
    expect(s).toMatchObject({ k: 0.6, y: 349, cost: 22 });
  });
  it('crosses the foe rather than the caster when blocked', () => {
    const s = superBandSlot([sp(140, 420, 3), sp(380, 600, 1)], [], 1);
    expect(s).toMatchObject({ k: 0.6, y: 552, cost: 99 });
  });
  it('defaults', () => {
    expect(superBandSlot([sp(235, 478, 3)], [], 1)).toMatchObject({ k: 0.7, y: 176 });
    expect(superBandSlot([], [], 1)).toMatchObject({ k: 1, y: 200 });
  });
  it('bandHidesWeather matches the old two slots', () => {
    expect([bandHidesWeather(200, 1), bandHidesWeather(520, 1), bandHidesWeather(178, 0.7), bandHidesWeather(540, 0.6)]).toEqual([true, false, true, false]);
  });
  it('nameHalfWidth narrows beside a control the band reaches', () => {
    const y = 300;
    const e = bandExt(1);
    expect(nameHalfWidth(y, e, [])).toBe(430);
    expect(nameHalfWidth(y, e, [rect(1019, 280, 1126, 400)])).toBe(367);
    expect(nameHalfWidth(y, e, [rect(1019, 500, 1126, 600)])).toBe(430);
    expect(nameHalfWidth(y, e, [rect(31, 280, 284, 400)])).toBe(344);
  });
  it('portraitSide falls back to the other side, then to none', () => {
    const l = rect(0, 0, 400, 720);
    const r = rect(900, 0, 1280, 720);
    expect(portraitSide(-1, 300, 1, [])).toBe(-1);
    expect(portraitSide(-1, 300, 1, [l])).toBe(1);
    expect(portraitSide(1, 300, 1, [r])).toBe(-1);
    expect(portraitSide(-1, 300, 1, [l, r])).toBe(0);
    expect(portraitRect(-1, 300, 1).x0).toBeLessThan(120);
  });
  it('brute force: in range, minimal cost, portrait off every avoid rect', () => {
    let seed = 12345;
    const rnd = (n: number): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % n;
    };
    for (let c = 0; c < 500; c++) {
      const spans: Span[] = [];
      for (let i = 0, n = 1 + rnd(4); i < n; i++) {
        const top = 100 + rnd(350);
        spans.push(sp(top, top + 150 + rnd(150), rnd(2) === 0 ? 1 : 3));
      }
      const avoid: Rect[] = [];
      for (let i = 0, n = rnd(5); i < n; i++) {
        const x = rnd(1100);
        const y = rnd(600);
        avoid.push(rect(x, y, x + 60 + rnd(200), y + 60 + rnd(150)));
      }
      const side = rnd(2) === 0 ? -1 : 1;
      const slot = superBandSlot(spans, avoid, side);
      expect(slot.y - slot.ext).toBeGreaterThanOrEqual(117);
      expect(slot.y + slot.ext).toBeLessThanOrEqual(603);
      expect([1, 0.85, 0.7, 0.6]).toContain(slot.k);
      let min = Infinity;
      for (const k of [1, 0.85, 0.7, 0.6]) {
        const ext = bandExt(k);
        for (let y = 117 + Math.ceil(ext); y + ext <= 603; y++) {
          let cost = 0;
          for (const s of spans) cost += s.w * Math.max(0, Math.min(y + ext, s.bottom) - Math.max(y - ext, s.top));
          min = Math.min(min, cost);
        }
      }
      expect(slot.cost).toBe(min);
      if (slot.side !== 0) {
        const p = portraitRect(slot.side, slot.y, slot.k);
        for (const a of avoid) expect(p.x0 < a.x1 && a.x0 < p.x1 && p.y0 < a.y1 && a.y0 < p.y1).toBe(false);
      }
    }
  });
});

describe('bandWindow (tall view)', () => {
  it('keeps the 16:9 rows (117..603, preferred 200) on a view no taller than 720, whatever the HUD and bar', () => {
    for (const h of [720, 720.4]) expect(bandWindow(h, 230, 1200)).toEqual({ top: 117, bottom: 603, high: 200 });
    expect(LANDSCAPE_WINDOW).toEqual({ top: 117, bottom: 603, high: 200 });
  });
  it('the default window is the landscape one, and a tall window moves the slot inside it', () => {
    const spans: Span[] = [{ top: 300, bottom: 560, w: 3 }];
    expect(superBandSlot(spans, [], 1)).toEqual(superBandSlot(spans, [], 1, LANDSCAPE_WINDOW));
    const win = bandWindow(1380, 230, 1220);
    const slot = superBandSlot([{ top: 1000, bottom: 1200, w: 3 }], [], 1, win);
    expect(slot.y - slot.ext).toBeGreaterThanOrEqual(win.top);
    expect(slot.y + slot.ext).toBeLessThanOrEqual(win.bottom);
    expect(slot.cost).toBe(0);
  });
  it('runs from under the HUD band (never above the weather row) to just above the bar', () => {
    const w = bandWindow(1943, 230, 1500);
    expect(w.top).toBe(240);
    expect(w.bottom).toBe(1492);
    expect(w.high).toBe(340);
    expect(bandWindow(1380, 300, 1200).top).toBe(300);
  });
  it('never collapses: a bar too close to the HUD still leaves the smallest band a window', () => {
    const w = bandWindow(900, 230, 260);
    expect(w.bottom - w.top).toBeGreaterThanOrEqual(2 * bandExt(0.6));
  });
});
