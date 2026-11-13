import { describe, expect, it } from 'vitest';
import { overlayRect, syncTouchOverlays } from './touch-overlay';

describe('overlayRect', () => {
  it('puts a logical box over the canvas, relative to the offset parent, scaled by k', () => {
    expect(overlayRect({ touch: 'Dash', x: 100, y: 600, size: 77 }, { left: 20, top: 10 }, { left: 20, top: 0 }, 0.5)).toEqual({ left: 50, top: 310, size: 38.5 });
  });
  it('is the canvas origin for the box at 0,0 when canvas and parent coincide', () => {
    expect(overlayRect({ touch: 'Tag', x: 0, y: 0, size: 77 }, { left: 0, top: 0 }, { left: 0, top: 0 }, 1)).toEqual({ left: 0, top: 0, size: 77 });
  });
});

describe('syncTouchOverlays', () => {
  it('does nothing without a document or a laid-out canvas', () => {
    expect(() => { syncTouchOverlays([], { getBoundingClientRect: () => ({ left: 0, top: 0, width: 0 }) }); }).not.toThrow();
  });
});
