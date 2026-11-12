// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_TOUCH_LAYOUT,
  TOUCH_LAYOUT_KEY,
  applyTouchLayout,
  readTouchLayout,
  resolveTouchSize,
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
    writeTouchLayout({ size: 'compact', side: 'left' });
    expect(readTouchLayout()).toEqual({ size: 'compact', side: 'left' });
    localStorage.setItem(TOUCH_LAYOUT_KEY, '{"size":"huge","side":3}');
    expect(readTouchLayout()).toEqual(DEFAULT_TOUCH_LAYOUT);
    localStorage.setItem(TOUCH_LAYOUT_KEY, 'not json');
    expect(readTouchLayout()).toEqual(DEFAULT_TOUCH_LAYOUT);
  });

  it('reflects the resolved layout on the root element', () => {
    const root = document.createElement('html');
    applyTouchLayout({ size: 'auto', side: 'left' }, root, mm(true));
    expect(root.dataset['touchSize']).toBe('large');
    expect(root.dataset['touchSide']).toBe('left');
    applyTouchLayout({ size: 'auto', side: 'right' }, root, mm(false));
    expect(root.dataset['touchSize']).toBe('compact');
    applyTouchLayout({ size: 'large', side: 'right' }, root, mm(false));
    expect(root.dataset['touchSize']).toBe('large');
  });
});
