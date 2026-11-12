// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BINDINGS, getBindings, setBindings } from '../platform/input/bindings';
import { TOUCH, setTouchText, touchButton, touchButtons, watchTouch } from './touch-controls';
import type { RenderView } from '@core/index';

const events: string[] = [];
const record = (e: Event): void => {
  const k = e as KeyboardEvent;
  events.push(`${k.type}:${k.code}`);
};
window.addEventListener('keydown', record);
window.addEventListener('keyup', record);

afterEach(() => {
  events.length = 0;
  setBindings(DEFAULT_BINDINGS);
  document.body.replaceChildren();
});

/** happy-dom has no pointer capture; the module calls it on pointerdown. */
function withCapture(b: HTMLButtonElement): string[] {
  const captured: string[] = [];
  b.setPointerCapture = (id: number) => void captured.push(String(id));
  return captured;
}
const pointer = (b: HTMLElement, type: string, pointerId = 1): Event => {
  const e = new Event(type, { cancelable: true, bubbles: true });
  Object.assign(e, { pointerId });
  b.dispatchEvent(e);
  return e;
};
const keyOn = (b: HTMLElement, type: string, key: string, repeat = false): KeyboardEvent => {
  const e = new KeyboardEvent(type, { key, repeat, cancelable: true, bubbles: true });
  b.dispatchEvent(e);
  return e;
};

describe('touchButton (real DOM events)', () => {
  it('pointerdown presses the bound key, captures the pointer and prevents default; pointerup releases once', () => {
    const b = touchButton('Dash', 2);
    const captured = withCapture(b);
    const code = String(getBindings().dash[0]);
    expect(pointer(b, 'pointerdown', 5).defaultPrevented).toBe(true);
    pointer(b, 'pointerdown', 5);
    expect(events).toEqual([`keydown:${code}`]);
    expect(captured).toEqual(['5']);
    pointer(b, 'pointerup');
    pointer(b, 'pointercancel');
    pointer(b, 'lostpointercapture');
    expect(events).toEqual([`keydown:${code}`, `keyup:${code}`]);
  });

  it('pointercancel and lostpointercapture each release a held key', () => {
    for (const t of ['pointercancel', 'lostpointercapture']) {
      events.length = 0;
      const b = touchButton('Super', 0);
      withCapture(b);
      pointer(b, 'pointerdown');
      pointer(b, t);
      expect(events.map((e) => e.split(':')[0])).toEqual(['keydown', 'keyup']);
    }
  });

  it('an unbound action presses nothing and does not capture', () => {
    setBindings({ ...DEFAULT_BINDINGS, trap: [] });
    const b = touchButton('Trap', 0);
    const captured = withCapture(b);
    pointer(b, 'pointerdown');
    pointer(b, 'pointerup');
    expect(events).toEqual([]);
    expect(captured).toEqual([]);
  });

  it('uses the rebound first key, read at press time', () => {
    const b = touchButton('Guard', 0);
    withCapture(b);
    setBindings({ ...DEFAULT_BINDINGS, guard: ['KeyG'] });
    pointer(b, 'pointerdown');
    expect(events).toEqual(['keydown:KeyG']);
  });

  it('Enter and Space hold like a finger, stop propagation, ignore repeat; keyup releases', () => {
    const b = touchButton('Weather', 0);
    document.body.append(b);
    const leaked: string[] = [];
    document.body.addEventListener('keydown', (e) => leaked.push(e.key));
    const code = String(getBindings().weather[0]);
    const down = keyOn(b, 'keydown', 'Enter');
    keyOn(b, 'keydown', 'Enter', true);
    expect(down.defaultPrevented).toBe(true);
    expect(leaked).toEqual([]);
    expect(events).toEqual([`keydown:${code}`]);
    keyOn(b, 'keyup', 'Enter');
    expect(events).toEqual([`keydown:${code}`, `keyup:${code}`]);
    keyOn(b, 'keydown', ' ');
    keyOn(b, 'keyup', ' ');
    expect(events).toHaveLength(4);
  });

  it('other keys do nothing; blur releases a held key', () => {
    const b = touchButton('Charge', 0);
    expect(keyOn(b, 'keydown', 'a').defaultPrevented).toBe(false);
    expect(events).toEqual([]);
    keyOn(b, 'keydown', 'Enter');
    b.dispatchEvent(new Event('blur'));
    expect(events.map((e) => e.split(':')[0])).toEqual(['keydown', 'keyup']);
  });

  it('sets id, classes, inline slot, type and the labelled text', () => {
    const b = touchButton('Tag2', 6);
    expect(b.id).toBe('arcadeTag2');
    expect(b.type).toBe('button');
    expect(b.className).toBe('menuButton touchBtn touchBtn-Tag2');
    expect(b.style.getPropertyValue('--touch-row')).toBe('6');
    expect(b.textContent).toBe('4 Tag 2');
    expect(b.getAttribute('aria-label')).toBe('4 Tag 2');
  });
});

describe('touchButtons / setTouchText (real DOM)', () => {
  it('builds the right ids in order, with Trap last and Charge dropped for an all-ranged team', () => {
    expect(touchButtons(1).map((b) => b.id)).toEqual(['arcadeSuper', 'arcadeGuard', 'arcadeDash', 'arcadeWeather', 'arcadeCharge', 'arcadeTrap']);
    expect(touchButtons(2, [false, false]).map((b) => b.id)).toEqual(['arcadeSuper', 'arcadeGuard', 'arcadeDash', 'arcadeWeather', 'arcadeTag', 'arcadeTrap']);
    expect(touchButtons(3).map((b) => b.id)).toEqual(TOUCH.map((l) => `arcade${l}`));
  });

  it('setTouchText writes the status and the accessible name, and clears them', () => {
    const b = touchButton('Super', 0);
    setTouchText(b, 'Super', 'ready');
    expect(b.textContent).toBe('9 Super\nready');
    expect(b.getAttribute('aria-label')).toBe('9 Super, ready');
    setTouchText(b, 'Super');
    expect(b.getAttribute('aria-label')).toBe('9 Super');
  });
});

describe('watchTouch', () => {
  it('refreshes status words on a timer and stops once the buttons leave the page', () => {
    vi.useFakeTimers();
    try {
      const b = touchButton('Super', 0);
      document.body.append(b);
      let meter = 250;
      const view = { arcade: () => ({ meter: [meter, 0] }), actionBar: () => undefined } as unknown as RenderView;
      watchTouch([b], view);
      vi.advanceTimersByTime(250);
      expect(b.textContent).toBe('9 Super\n25%');
      meter = 1000;
      vi.advanceTimersByTime(250);
      expect(b.textContent).toBe('9 Super\nready');
      b.remove();
      vi.advanceTimersByTime(250);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
