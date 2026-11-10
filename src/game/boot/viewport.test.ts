import { describe, expect, it } from 'vitest';
import { ACTION_BAR_HEIGHT, BAR_Y, SLOT_SIDE, slotX } from '../hud/action-bar';
import { HUD_HEIGHT, HUD_WIDTH, benchBar, mainBar, sideOffset } from '../hud/bars';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, MAX_RESOLUTION, pickResolution } from './viewport';

describe('pickResolution', () => {
  it('rounds the device pixel ratio up and caps it', () => {
    expect(pickResolution(1)).toBe(1);
    expect(pickResolution(0.75)).toBe(1);
    expect(pickResolution(1.25)).toBe(2);
    expect(pickResolution(2)).toBe(2);
    expect(pickResolution(3)).toBe(MAX_RESOLUTION);
    expect(pickResolution(Number.NaN)).toBe(1);
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
