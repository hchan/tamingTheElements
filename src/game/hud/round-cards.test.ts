import { describe, expect, it } from 'vitest';
import {
  PUNCH_SCALE, PUNCH_TICKS, bannerFrame,
  CARD_CLEAR_TICKS, CARD_IN_TICKS, CARD_SLIDE_PX, bannerColorFor, bannerSizeFor, cardColorFor, cardFrame, haloFor, isIntroBanner, type CardFrame,
} from './round-cards';

const out = (): CardFrame => ({ alpha: 0, offset: 0 });

describe('round name cards', () => {
  it('recognises the intro banners only', () => {
    for (const m of ['ROUND 1', 'ROUND 3', 'FINAL ROUND', 'SUDDEN DEATH']) expect(isIntroBanner(m)).toBe(true);
    for (const m of ['FIGHT!', 'K.O.', 'TIME', 'PERFECT', 'VICTORY', '']) expect(isIntroBanner(m)).toBe(false);
  });

  it('slides in from the edge, holds, fades out and is gone before FIGHT!', () => {
    const total = 91;
    expect(cardFrame(0, total, false, out())).toEqual({ alpha: 0, offset: CARD_SLIDE_PX });
    expect(cardFrame(CARD_IN_TICKS, total, false, out())).toEqual({ alpha: 1, offset: 0 });
    expect(cardFrame(40, total, false, out())).toEqual({ alpha: 1, offset: 0 });
    const mid = cardFrame(CARD_IN_TICKS / 2, total, false, out());
    expect(mid.offset).toBeGreaterThan(0);
    expect(mid.offset).toBeLessThan(CARD_SLIDE_PX / 2);
    expect(cardFrame(total - CARD_CLEAR_TICKS, total, false, out()).alpha).toBe(0);
    expect(cardFrame(total, total, false, out()).alpha).toBe(0);
  });

  it('reduced motion keeps the name but never moves it', () => {
    for (let age = 0; age < 91; age++) expect(cardFrame(age, 91, true, out()).offset).toBe(0);
    expect(cardFrame(40, 91, true, out()).alpha).toBe(1);
  });
});

describe('KO banner weight', () => {
  it('draws K.O. biggest and brightest, FIGHT! larger, the rest at base size', () => {
    expect(bannerSizeFor('K.O.')).toBeGreaterThan(bannerSizeFor('FIGHT!'));
    expect(bannerSizeFor('FIGHT!')).toBeGreaterThan(1);
    expect(bannerSizeFor('ROUND 1')).toBe(1);
    expect(bannerColorFor('K.O.')).not.toBe(bannerColorFor('ROUND 1'));
  });

  it('halo peaks on the first tick, decays, and is off for plain banners and reduced motion', () => {
    expect(haloFor('K.O.', 0, false)).toBeGreaterThan(haloFor('K.O.', 20, false));
    expect(haloFor('K.O.', 40, false)).toBe(0);
    expect(haloFor('ROUND 1', 0, false)).toBe(0);
    expect(haloFor('K.O.', 0, true)).toBe(0);
  });
});

describe('card colour', () => {
  const lum = (hex: string): number => {
    const c = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
  };
  it('pulls every element colour toward bone, so it differs from the raw same-element floor hue', () => {
    for (const e of [0xe0502a, 0x2a70e0, 0x70b0e0, 0x8a6a3a]) {
      const c = cardColorFor(e);
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
      expect(lum(c)).toBeGreaterThan(lum(`#${e.toString(16).padStart(6, '0')}`));
      expect(lum(c)).toBeGreaterThan(0.4);
    }
  });
});

describe('banner frame (QA r20: no ghosted KO or FIGHT!)', () => {
  it('big calls are fully opaque from the first tick and punch in from PUNCH_SCALE', () => {
    for (const m of ['K.O.', 'FIGHT!', 'DOUBLE K.O.']) {
      const f0 = bannerFrame(m, 0, 60, false, 2, 8, 12);
      expect(f0).toEqual({ alpha: 1, scale: PUNCH_SCALE });
      expect(bannerFrame(m, PUNCH_TICKS, 50, false, 1, 8, 12)).toEqual({ alpha: 1, scale: 1 });
      expect(bannerFrame(m, 3, 40, false, 1, 8, 12).alpha).toBe(1);
    }
  });
  it('big calls only fade at the end, and show no scale with reduced motion', () => {
    expect(bannerFrame('K.O.', 40, 6, false, 1, 8, 12).alpha).toBeCloseTo(0.5);
    expect(bannerFrame('K.O.', 40, 0, false, 1, 8, 12).alpha).toBe(0);
    expect(bannerFrame('FIGHT!', 0, 60, true, 1, 8, 12)).toEqual({ alpha: 1, scale: 1 });
  });
  it('ordinary banners keep the slow scale-in and the fade-in', () => {
    const f = bannerFrame('ROUND 1', 0, 60, false, 2, 8, 12);
    expect(f.scale).toBe(2);
    expect(f.alpha).toBeCloseTo(1 / 8);
    expect(bannerFrame('ROUND 1', 20, 60, true, 1, 8, 12).alpha).toBe(1);
  });
});
