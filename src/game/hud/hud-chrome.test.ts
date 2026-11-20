import { describe, expect, it } from 'vitest';
import { HudChrome, SCRIM_OVERSCAN } from './hud-chrome';
import { HUD_WIDTH } from './bars';
import { hudFrame } from './arcade-hud';

describe('HudChrome scrim', () => {
  it('spans the whole HUD camera frame on the widest view, not only 0..1280', () => {
    const rects: { x: number; w: number }[] = [];
    const g = {
      setDepth: () => g,
      fillStyle: () => g,
      fillRect: (x: number, _y: number, w: number) => {
        rects.push({ x, w });
        return g;
      },
    };
    new HudChrome({ add: { graphics: () => g as never } }).drawScrim();
    const wide = hudFrame(1558);
    expect(rects.length).toBeGreaterThan(0);
    for (const r of rects) {
      expect(r.x).toBeLessThanOrEqual(wide.x);
      expect(r.x + r.w).toBeGreaterThanOrEqual(wide.x + wide.w);
      expect(r.w).toBe(HUD_WIDTH + 2 * SCRIM_OVERSCAN);
    }
  });
});
