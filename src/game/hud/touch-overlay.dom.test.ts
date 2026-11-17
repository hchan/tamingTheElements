// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { syncTouchOverlays } from './touch-overlay';

const canvas = { getBoundingClientRect: () => ({ left: 0, top: 52, width: 360, height: 202.5 }) };

describe('syncTouchOverlays portrait skirts', () => {
  it('gives boxes with no button a click-through skirt of the same height, and removes them without a skirt', () => {
    document.body.innerHTML = '<div id="g"><button id="arcadeDash" class="touchBtn"></button></div>';
    const items = [
      { touch: '', x: 0, y: 600, size: 128 },
      { touch: 'Charge', x: 128, y: 600, size: 128 },
      { touch: 'Dash', x: 256, y: 600, size: 128 },
    ];
    syncTouchOverlays(items, canvas, document, 44);
    const decos = [...document.querySelectorAll<HTMLElement>('.touchSkirtDeco')];
    expect(decos.map((d) => d.id)).toEqual(['touchSkirtDeco0', 'touchSkirtDeco1']);
    const dash = document.getElementById('arcadeDash');
    expect(decos[0]?.style.height).toBe(dash?.style.height);
    syncTouchOverlays(items, canvas, document);
    expect(document.querySelectorAll('.touchSkirtDeco')).toHaveLength(0);
  });
});

describe('syncTouchOverlays box placement', () => {
  const place = (rect: { left: number; top: number; width: number; height: number }): { left: number; top: number } => {
    document.body.innerHTML = '<div id="g"><button id="arcadeDash" class="touchBtn"></button></div>';
    syncTouchOverlays([{ touch: 'Dash', x: 100, y: 600, size: 80 }], { getBoundingClientRect: () => rect }, document);
    const el = document.getElementById('arcadeDash') as HTMLElement;
    return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
  };
  it('normal view: the box origin is the canvas origin', () => {
    const r = place({ left: 0, top: 0, width: 640, height: 360 });
    expect(r.left).toBeCloseTo(50, 3);
    expect(r.top).toBeCloseTo(300, 3);
  });
  it('wide view: the 1280 box is centred horizontally', () => {
    const r = place({ left: 0, top: 0, width: 800, height: 360 });
    expect(r.left).toBeCloseTo(80 + 50, 3);
    expect(r.top).toBeCloseTo(300, 3);
  });
  it('tall view: the 1280x720 box sits at the bottom of the canvas', () => {
    const r = place({ left: 0, top: 52, width: 390, height: 592 });
    const k = 390 / 1280;
    expect(r.left).toBeCloseTo(100 * k, 1);
    expect(r.top).toBeCloseTo(52 + 592 - 720 * k + 600 * k, 1);
  });
});
