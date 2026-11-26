import { describe, expect, it } from 'vitest';
import { boxSpanX, setFrameBox, type BoxedImage } from './hero-scale';
import { frameOpaque, opaqueColumns, setFrameOpaque } from './opaque-span';

function rgba(w: number, h: number, cols: number[]): Uint8Array {
  const d = new Uint8Array(w * h * 4);
  for (const x of cols) d[(2 * w + x) * 4 + 3] = 255;
  return d;
}

describe('opaque-bbox-tuck', () => {
  it('finds the opaque columns and ignores a faint halo', () => {
    expect(opaqueColumns(rgba(10, 4, [3, 4, 7]), 10, 4)).toEqual([3, 8]);
    expect(opaqueColumns(new Uint8Array(40 * 4), 40, 4)).toBeUndefined();
    const halo = rgba(10, 4, [5]);
    halo[(1 * 10 + 0) * 4 + 3] = 10;
    expect(opaqueColumns(halo, 10, 4)).toEqual([5, 6]);
  });
  it('the wall span follows the opaque columns, not the frame box, mirrored with flipX', () => {
    const mk = (flipX: boolean): BoxedImage => {
      const frame = { width: 200, height: 200, customData: {} };
      setFrameBox(frame, { x: 40, y: 0, w: 120, h: 200 });
      setFrameOpaque(frame, [60, 100]);
      return { x: 0, y: 0, flipX, displayWidth: 200, displayHeight: 200, frame, setPosition: () => undefined, setDisplaySize: () => undefined };
    };
    expect(frameOpaque(mk(false).frame)).toEqual([60, 100]);
    const a = boxSpanX(mk(false), 0, { min: 0, max: 0 });
    expect([a.min, a.max]).toEqual([60, 100]); // the box alone gave 40..160
    const b = boxSpanX(mk(true), 0, { min: 0, max: 0 });
    expect([b.min, b.max]).toEqual([100, 140]);
  });
});
