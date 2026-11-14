import { describe, expect, it } from 'vitest';
import { ACTION_BAR_HEIGHT, BAR_Y, SLOT_SIDE, slotX } from '../hud/action-bar';
import { HUD_HEIGHT, HUD_WIDTH, benchBar, mainBar, sideOffset } from '../hud/bars';
import { DEFAULT_RESOLUTION, LOGICAL_HEIGHT, LOGICAL_WIDTH, MAX_RESOLUTION, pickResolution, wideViewWidth } from './viewport';

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
