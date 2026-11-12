// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_TOUCH_LAYOUT,
  TOUCH_LAYOUT_KEY,
  applyTouchLayout,
  readTouchLayout,
  resolveTouchSize,
  touchHaptic,
  writeTouchLayout,
} from './touch-layout';

const mm = (coarse: boolean) => () => ({ matches: coarse });

beforeEach(() => {
  localStorage.clear();
});

describe('touch layout', () => {
  it('auto follows any-pointer: coarse, so a touch laptop gets large buttons', () => {
    expect(resolveTouchSize('auto', true)).toBe('large');
    expect(resolveTouchSize('auto', false)).toBe('compact');
    expect(resolveTouchSize('compact', true)).toBe('compact');
    expect(resolveTouchSize('large', false)).toBe('large');
  });

  it('defaults, round-trips and ignores junk', () => {
    expect(readTouchLayout()).toEqual(DEFAULT_TOUCH_LAYOUT);
    writeTouchLayout({ size: 'compact', side: 'left', haptics: false });
    expect(readTouchLayout()).toEqual({ size: 'compact', side: 'left', haptics: false });
    localStorage.setItem(TOUCH_LAYOUT_KEY, '{"size":"huge","side":3}');
    expect(readTouchLayout()).toEqual(DEFAULT_TOUCH_LAYOUT);
    localStorage.setItem(TOUCH_LAYOUT_KEY, 'not json');
    expect(readTouchLayout()).toEqual(DEFAULT_TOUCH_LAYOUT);
  });

  it('reflects the resolved layout on the root element', () => {
    const root = document.createElement('html');
    applyTouchLayout({ size: 'auto', side: 'left', haptics: true }, root, mm(true));
    expect(root.dataset['touchSize']).toBe('large');
    expect(root.dataset['touchSide']).toBe('left');
    applyTouchLayout({ size: 'auto', side: 'right', haptics: true }, root, mm(false));
    expect(root.dataset['touchSize']).toBe('compact');
    applyTouchLayout({ size: 'large', side: 'right', haptics: true }, root, mm(false));
    expect(root.dataset['touchSize']).toBe('large');
  });

  it('haptics: vibrates briefly unless switched off, and never throws', () => {
    const root = document.createElement('html');
    const calls: number[] = [];
    const nav = { vibrate: (n: number) => {
      calls.push(n);
      return true;
    } };
    applyTouchLayout({ size: 'auto', side: 'right', haptics: true }, root, mm(true));
    touchHaptic(root, nav);
    expect(calls).toEqual([12]);
    applyTouchLayout({ size: 'auto', side: 'right', haptics: false }, root, mm(true));
    touchHaptic(root, nav);
    expect(calls).toEqual([12]);
    applyTouchLayout({ size: 'auto', side: 'right', haptics: true }, root, mm(true));
    expect(() => { touchHaptic(root, undefined); }).not.toThrow();
    expect(() => { touchHaptic(root, { vibrate: () => { throw new Error('blocked'); } }); }).not.toThrow();
  });
});
