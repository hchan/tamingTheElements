import type Phaser from 'phaser';
import { afterEach, describe, expect, it } from 'vitest';
import { setSavedPrefs } from '../platform/a11y/prefs';
import { HERO_GRADE, gradeHeroRgba, rimLightRgba, gradedHeroTexture, grimKey } from './hero-grade';

const sat = (r: number, g: number, b: number): number => Math.max(r, g, b) - Math.min(r, g, b);
const grade = (rgba: number[]): number[] => {
  const px = [...rgba];
  gradeHeroRgba(px);
  return px;
};

describe('gradeHeroRgba', () => {
  it('desaturates and darkens bright art, leaves alpha alone and is deterministic', () => {
    const px = [250, 60, 40, 255];
    const a = grade(px);
    expect(sat(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0)).toBeLessThan(sat(250, 60, 40));
    expect((a[0] ?? 0) + (a[1] ?? 0) + (a[2] ?? 0)).toBeLessThan(250 + 60 + 40);
    expect(a[3]).toBe(255);
    expect(grade(px)).toEqual(a);
  });

  it('skips fully transparent pixels', () => {
    expect(grade([200, 10, 10, 0])).toEqual([200, 10, 10, 0]);
  });

  it('lifts hard black outlines to a soft umber but keeps them the darkest pixels', () => {
    const [r = 0, g = 0, b = 0] = grade([0, 0, 0, 255]);
    expect(r + g + b).toBeGreaterThan(20);
    expect(r).toBeLessThan(HERO_GRADE.outline[0] + 6);
    const mid = grade([120, 110, 100, 255]);
    expect((mid[0] ?? 0) + (mid[1] ?? 0) + (mid[2] ?? 0)).toBeGreaterThan(r + g + b + 100);
  });

  it('barely moves already-dark art (a Pax-like shadow stays readable)', () => {
    const [r = 0] = grade([70, 60, 55, 255]);
    expect(Math.abs(r - 70)).toBeLessThan(14);
  });

  it('keeps the six element hues apart after grading', () => {
    const hues: number[][] = [
      [240, 90, 30, 255], [60, 130, 240, 255], [200, 220, 235, 255],
      [130, 100, 60, 255], [70, 180, 70, 255], [110, 70, 150, 255],
    ];
    const out = hues.map((c) => grade(c));
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const d = Math.sqrt([0, 1, 2].reduce((s, k) => s + ((out[i]?.[k] ?? 0) - (out[j]?.[k] ?? 0)) ** 2, 0));
        expect(d).toBeGreaterThan(30);
      }
    }
  });
});

describe('gradedHeroTexture', () => {
  afterEach(() => { setSavedPrefs({}); });

  it('falls back to the plain key with no canvas path, and reuses an existing graded copy', () => {
    const none = { textures: { exists: () => false, get: () => ({}) } } as unknown as Phaser.Scene;
    expect(gradedHeroTexture(none, 'map:fiara')).toBe('map:fiara');
    const have = { textures: { exists: (k: string) => k === grimKey('map:fiara') } } as unknown as Phaser.Scene;
    expect(gradedHeroTexture(have, 'map:fiara')).toBe('map:fiara~grim');
  });

  it('is off in high-contrast mode', () => {
    setSavedPrefs({ highContrast: true });
    const have = { textures: { exists: () => true } } as unknown as Phaser.Scene;
    expect(gradedHeroTexture(have, 'map:fiara')).toBe('map:fiara');
  });

  it('never grades the painted portrait heroes (strip, sheet or HUD picture)', () => {
    const have = { textures: { exists: () => true } } as unknown as Phaser.Scene;
    for (const k of ['map:pax', 'sheet:sindarosa', 'map:curomo']) expect(gradedHeroTexture(have, k)).toBe(k);
  });
});

describe('rimLightRgba', () => {
  /** 7x7 sheet, a 5x5 opaque block of colour `c` in the middle. */
  const block = (c: number[]): number[] => {
    const px: number[] = [];
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) px.push(...(x >= 1 && x <= 5 && y >= 1 && y <= 5 ? [...c, 255] : [0, 0, 0, 0]));
    return px;
  };
  const at = (px: number[], x: number, y: number): number[] => px.slice((y * 7 + x) * 4, (y * 7 + x) * 4 + 4);

  it('lights the edge of a dark shape more than its core, keeps alpha and stays inside the shape', () => {
    const px = block([30, 30, 40]);
    rimLightRgba(px, 7, 7);
    expect(at(px, 1, 1)[2]).toBeGreaterThan((at(px, 3, 3)[2] ?? 0) + 40);
    expect(at(px, 1, 1)[3]).toBe(255);
    expect(at(px, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('is deterministic and gives a warm rim a warmer edge than the cool default', () => {
    const a = block([30, 30, 40]);
    const b = block([30, 30, 40]);
    rimLightRgba(a, 7, 7, [255, 176, 96]);
    rimLightRgba(b, 7, 7);
    expect((at(a, 1, 1)[0] ?? 0) - (at(a, 1, 1)[2] ?? 0)).toBeGreaterThan((at(b, 1, 1)[0] ?? 0) - (at(b, 1, 1)[2] ?? 0));
    const c = block([30, 30, 40]);
    rimLightRgba(c, 7, 7);
    expect(c).toEqual(b);
  });
});
