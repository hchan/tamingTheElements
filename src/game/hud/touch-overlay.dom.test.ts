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
