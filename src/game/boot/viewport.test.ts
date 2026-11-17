import { describe, expect, it } from 'vitest';
import { ACTION_BAR_HEIGHT, BAR_Y, SLOT_SIDE, slotX } from '../hud/action-bar';
import { HUD_HEIGHT, HUD_WIDTH, benchBar, mainBar, sideOffset } from '../hud/bars';
import { DEFAULT_RESOLUTION, LOGICAL_HEIGHT, LOGICAL_WIDTH, MAX_RESOLUTION, MAX_TALL_HEIGHT, pickResolution, resolutionOf, tallGameSize, tallResolution, tallViewHeight, viewHeight, wideViewWidth } from './viewport';
import { PORTRAIT_DECK, PORTRAIT_TOP_STRIP, deckFor } from './portrait-play';
import type Phaser from 'phaser';

const sceneOf = (width: number, height: number): Phaser.Scene => ({ scale: { width, height } }) as unknown as Phaser.Scene;

describe('resolutionOf and viewHeight', () => {
  it('is height/720 for the normal and wide views', () => {
    expect(resolutionOf(sceneOf(1920, 1080))).toBe(1.5);
    expect(resolutionOf(sceneOf(2463, 1080))).toBe(1.5);
    expect(viewHeight(sceneOf(1920, 1080))).toBe(720);
    expect(viewHeight(sceneOf(2463, 1080))).toBe(720);
  });
  it('is width/1280 for the tall view', () => {
    expect(resolutionOf(sceneOf(1280, 1944))).toBe(1);
    expect(viewHeight(sceneOf(1280, 1944))).toBe(1944);
    expect(viewHeight(sceneOf(1536, 2332))).toBeCloseTo(1944, -1);
  });
});

describe('tallViewHeight', () => {
  it('fills the canvas box between the strip and the deck', () => {
    expect(tallViewHeight(390, 844, PORTRAIT_TOP_STRIP, PORTRAIT_DECK)).toBe(1942);
    expect(tallViewHeight(360, 640, PORTRAIT_TOP_STRIP, PORTRAIT_DECK)).toBe(1378);
  });
  it('is even, clamped to 2400, and 720 (no tall view) when the box is not taller than 16:9', () => {
    for (let h = 600; h < 1000; h += 13) expect(tallViewHeight(390, h, 52, 200) % 2).toBe(0);
    expect(tallViewHeight(300, 2000, 52, 200)).toBe(MAX_TALL_HEIGHT);
    expect(tallViewHeight(1280, 720, 52, 200)).toBe(LOGICAL_HEIGHT);
    expect(tallViewHeight(844, 390, 52, 200)).toBe(LOGICAL_HEIGHT);
    expect(tallViewHeight(0, 0, 52, 200)).toBe(LOGICAL_HEIGHT);
  });
});

describe('tallResolution', () => {
  it('keeps the pixel budget of the normal layout and never drops under 1', () => {
    expect(tallResolution(1.5, 720)).toBe(1.5);
    for (const res of [1.5, 2]) {
      for (let h = 720; h <= MAX_TALL_HEIGHT; h += 62) {
        const { w, h: ph } = tallGameSize(res, h);
        expect(w * ph).toBeLessThanOrEqual(2560 * 1440);
        expect(tallResolution(res, h)).toBeGreaterThanOrEqual(1);
      }
    }
    expect(tallGameSize(1.5, 1944)).toEqual({ w: 1280, h: 1944 });
    expect(tallGameSize(2, 1944).w).toBe(Math.floor(1280 * 2 * Math.sqrt(720 / 1944)));
  });
});

describe('deckFor', () => {
  it('is 200 with no inset and grows when the stick is lifted by a safe-area inset', () => {
    expect(deckFor(844, 696, 696)).toBe(200);
    expect(deckFor(844, 696 - 34, 700)).toBe(200 + 34);
    expect(deckFor(844, 700, 640)).toBe(844 - 640 + 52);
    expect(deckFor(844, Number.NaN, 700)).toBe(200);
  });
});

describe('pickResolution', () => {
  it('rounds the device pixel ratio up and caps it', () => {
    expect(pickResolution(1)).toBe(DEFAULT_RESOLUTION);
    expect(LOGICAL_WIDTH * DEFAULT_RESOLUTION).toBe(1920);
    expect(LOGICAL_HEIGHT * DEFAULT_RESOLUTION).toBe(1080);
    expect(pickResolution(0.75)).toBe(DEFAULT_RESOLUTION);
    expect(pickResolution(1.25)).toBe(DEFAULT_RESOLUTION);
    expect(pickResolution(1.75)).toBe(2);
    expect(pickResolution(2)).toBe(2);
    expect(pickResolution(3)).toBe(MAX_RESOLUTION);
    expect(pickResolution(Number.NaN)).toBe(DEFAULT_RESOLUTION);
  });
});

describe('wideViewWidth', () => {
  it('fills a wide phone up to the world width and keeps 16:9 or taller screens at 1280', () => {
    // 844x390 phone landscape: the #game box is 844x370 (the 10 px edge band).
    expect(wideViewWidth(844, 370, 1920)).toBe(1642);
    expect(wideViewWidth(932, 410, 1920)).toBe(1636);
    expect(wideViewWidth(1280, 720, 1920)).toBe(LOGICAL_WIDTH);
    expect(wideViewWidth(1024, 768, 1920)).toBe(LOGICAL_WIDTH);
    expect(wideViewWidth(390, 844, 1920)).toBe(LOGICAL_WIDTH);
    // 32:9 is capped at the world, and a world no wider than 1280 never widens.
    expect(wideViewWidth(3840, 1080, 1920)).toBe(1920);
    expect(wideViewWidth(844, 370, 1280)).toBe(LOGICAL_WIDTH);
    expect(wideViewWidth(0, 0, 1920)).toBe(LOGICAL_WIDTH);
  });

  it('is even, so a 1.5 resolution gives a whole-pixel canvas', () => {
    for (let w = 700; w < 1400; w += 7) expect(wideViewWidth(w, 330, 1920) % 2).toBe(0);
  });
});

describe('HUD and action bar stay inside the logical game area', () => {
  it('bars span within 0..1280 and the top HUD within 0..100', () => {
    for (const team of [0, 1]) {
      const x = sideOffset(team);
      for (const g of [mainBar(x), ...[0, 1, 2, 3].map((i) => benchBar(x, i))]) {
        expect(g.minX).toBeGreaterThanOrEqual(0);
        expect(g.maxX).toBeLessThanOrEqual(HUD_WIDTH);
        expect(g.y).toBeLessThan(2 * HUD_HEIGHT);
      }
    }
    expect(HUD_WIDTH).toBe(LOGICAL_WIDTH);
  });

  it('seven action slots fit in the bottom bar', () => {
    expect(slotX(6) + SLOT_SIDE).toBeLessThanOrEqual(LOGICAL_WIDTH);
    expect(BAR_Y + ACTION_BAR_HEIGHT).toBe(LOGICAL_HEIGHT);
  });
});
