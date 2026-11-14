// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { stickDir, touchStick } from './touch-stick';

const held = (d: ReturnType<typeof stickDir>): string => (['up', 'down', 'left', 'right'] as const).filter((k) => d[k]).join('+');

describe('stickDir', () => {
  it('is idle inside the dead zone', () => {
    expect(held(stickDir(5, -5, 66))).toBe('');
  });
  it('maps the 8 sectors', () => {
    const r = 66;
    expect(held(stickDir(50, 0, r))).toBe('right');
    expect(held(stickDir(-50, 0, r))).toBe('left');
    expect(held(stickDir(0, -50, r))).toBe('up');
    expect(held(stickDir(0, 50, r))).toBe('down');
    expect(held(stickDir(40, -40, r))).toBe('up+right');
    expect(held(stickDir(-40, -40, r))).toBe('up+left');
    expect(held(stickDir(40, 40, r))).toBe('down+right');
    expect(held(stickDir(-40, 40, r))).toBe('down+left');
  });
  it('treats a shallow angle as cardinal', () => {
    expect(held(stickDir(50, -10, 66))).toBe('right');
    expect(held(stickDir(10, 50, 66))).toBe('down');
  });
});

describe('touchStick', () => {
  const events: string[] = [];
  const record = (e: Event): void => void events.push(`${e.type}:${(e as KeyboardEvent).code}`);
  window.addEventListener('keydown', record);
  window.addEventListener('keyup', record);
  afterEach(() => {
    events.length = 0;
    document.body.replaceChildren();
  });
  const ptr = (t: HTMLElement, type: string, x: number, y: number): void => {
    const e = new Event(type, { cancelable: true, bubbles: true });
    Object.assign(e, { pointerId: 1, clientX: x, clientY: y });
    t.dispatchEvent(e);
  };
  it('holds the bound move keys while dragged and releases on lift', () => {
    const s = touchStick();
    s.setPointerCapture = () => undefined;
    s.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    document.body.append(s);
    ptr(s, 'pointerdown', 95, 50);
    expect(events).toEqual(['keydown:ArrowRight']);
    ptr(s, 'pointermove', 90, 5);
    expect(events).toEqual(['keydown:ArrowRight', 'keydown:ArrowUp']);
    ptr(s, 'pointermove', 50, 5);
    expect(events.slice(2)).toEqual(['keyup:ArrowRight']);
    ptr(s, 'pointerup', 50, 5);
    expect(events.slice(3)).toEqual(['keyup:ArrowUp']);
  });
});
