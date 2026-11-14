// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BINDINGS, SF_PRESET_BINDINGS, getBindings, setBindings } from '../platform/input/bindings';
import { TOUCH, releaseTouch, touchKeyLabel, setTouchText, touchButton, touchButtons, watchTouch } from './touch-controls';
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
    const b = touchButton('Dash');
    const captured = withCapture(b);
    const code = String(getBindings().dash[0]);
    expect(pointer(b, 'pointerdown', 5).defaultPrevented).toBe(true);
    pointer(b, 'pointerdown', 5);
    expect(events).toEqual([`keydown:${code}`]);
    expect(captured).toEqual(['5', '5']); // a second finger on the same button captures too; the key still went down once
    pointer(b, 'pointerup');
    pointer(b, 'pointercancel');
    pointer(b, 'lostpointercapture');
    expect(events).toEqual([`keydown:${code}`, `keyup:${code}`]);
  });

  it('pointercancel and lostpointercapture each release a held key', () => {
    for (const t of ['pointercancel', 'lostpointercapture']) {
      events.length = 0;
      const b = touchButton('Super');
      withCapture(b);
      pointer(b, 'pointerdown');
      pointer(b, t);
      expect(events.map((e) => e.split(':')[0])).toEqual(['keydown', 'keyup']);
    }
  });

  it('an unbound action presses nothing and does not capture', () => {
    setBindings({ ...DEFAULT_BINDINGS, trap: [] });
    const b = touchButton('Trap');
    const captured = withCapture(b);
    pointer(b, 'pointerdown');
    pointer(b, 'pointerup');
    expect(events).toEqual([]);
    expect(captured).toEqual([]);
  });

  it('uses the rebound first key, read at press time', () => {
    const b = touchButton('Guard');
    withCapture(b);
    setBindings({ ...DEFAULT_BINDINGS, guard: ['KeyG'] });
    pointer(b, 'pointerdown');
    expect(events).toEqual(['keydown:KeyG']);
  });

  it('Enter and Space hold like a finger, stop propagation, ignore repeat; keyup releases', () => {
    const b = touchButton('Weather');
    document.body.append(b);
    const leaked: string[] = [];
    document.body.addEventListener('keydown', (e) => leaked.push(e.key));
    const code = String(getBindings().weather[0]);
    const down = keyOn(b, 'keydown', 'Enter');
    keyOn(b, 'keydown', 'Enter', true);
    expect(down.defaultPrevented).toBe(true);
    expect(leaked).toEqual([]);
    expect(events).toEqual([`keydown:${code}`]);
    vi.useFakeTimers();
    try {
      keyOn(b, 'keyup', 'Enter');
      vi.advanceTimersByTime(200); // a quick tap is held for a minimum time
      expect(events).toEqual([`keydown:${code}`, `keyup:${code}`]);
      keyOn(b, 'keydown', ' ');
      keyOn(b, 'keyup', ' ');
      vi.advanceTimersByTime(200);
      expect(events).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('other keys do nothing; blur releases a held key', () => {
    const b = touchButton('Charge');
    expect(keyOn(b, 'keydown', 'a').defaultPrevented).toBe(false);
    expect(events).toEqual([]);
    keyOn(b, 'keydown', 'Enter');
    b.dispatchEvent(new Event('blur'));
    expect(events.map((e) => e.split(':')[0])).toEqual(['keydown', 'keyup']);
  });

  it('a second Enter inside the min-hold window continues the hold instead of being dropped', () => {
    vi.useFakeTimers();
    try {
      const b = touchButton('Dash');
      document.body.append(b);
      const code = String(getBindings().dash[0]);
      keyOn(b, 'keydown', 'Enter');
      keyOn(b, 'keyup', 'Enter');
      vi.advanceTimersByTime(40);
      const again = keyOn(b, 'keydown', 'Enter');
      expect(again.defaultPrevented).toBe(true);
      vi.advanceTimersByTime(500); // the first timer was cleared: still held
      expect(events).toEqual([`keydown:${code}`]);
      keyOn(b, 'keyup', 'Enter');
      vi.advanceTimersByTime(200);
      expect(events).toEqual([`keydown:${code}`, `keyup:${code}`]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releaseTouch lets go of a key held by pointer or keyboard and clears the pending timer', () => {
    vi.useFakeTimers();
    try {
      const b = touchButton('Guard');
      withCapture(b);
      document.body.append(b);
      const code = String(getBindings().guard[0]);
      pointer(b, 'pointerdown');
      releaseTouch(b);
      expect(events).toEqual([`keydown:${code}`, `keyup:${code}`]);
      events.length = 0;
      keyOn(b, 'keydown', 'Enter');
      keyOn(b, 'keyup', 'Enter'); // min-hold timer pending
      releaseTouch(b);
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(300);
      expect(events).toEqual([`keydown:${code}`, `keyup:${code}`]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sets id, classes, type and the labelled text', () => {
    const b = touchButton('Tag2');
    expect(b.id).toBe('arcadeTag2');
    expect(b.type).toBe('button');
    expect(b.className).toBe('menuButton touchBtn touchBtn-Tag2');
    expect(b.textContent).toBe('4\nTag 2');
    expect(b.getAttribute('aria-label')).toBe('4 Tag 2');
  });
});

describe('touchButtons / setTouchText (real DOM)', () => {
  it('builds the right ids in order, with Trap then Element last and Charge dropped for an all-ranged team', () => {
    expect(touchButtons(1).map((b) => b.id)).toEqual(['arcadeSuper', 'arcadeGuard', 'arcadeDash', 'arcadeWeather', 'arcadeCharge', 'arcadeTrap', 'arcadeElement', 'arcadeCleanse']);
    expect(touchButtons(2, [false, false]).map((b) => b.id)).toEqual(['arcadeSuper', 'arcadeGuard', 'arcadeDash', 'arcadeWeather', 'arcadeTag', 'arcadeTrap', 'arcadeElement', 'arcadeCleanse']);
    expect(touchButtons(3).map((b) => b.id)).toEqual(TOUCH.map((l) => `arcade${l}`));
  });

  it('setTouchText recovers a label something else rewrote', () => {
    const b = touchButton('Super');
    b.textContent = 'garbled';
    setTouchText(b, 'Super');
    expect(b.textContent).toBe('9\nSuper');
  });

  it('setTouchText writes the status and the accessible name, and clears them', () => {
    const b = touchButton('Super');
    setTouchText(b, 'Super', 'ready');
    expect(b.textContent).toBe('9\nSuper\nready');
    expect(b.getAttribute('aria-label')).toBe('9 Super, ready');
    setTouchText(b, 'Super');
    expect(b.getAttribute('aria-label')).toBe('9 Super');
  });
});

describe('watchTouch', () => {
  it('releases a key held by a button that was removed mid-hold', () => {
    vi.useFakeTimers();
    try {
      const b = touchButton('Dash');
      document.body.append(b);
      const code = String(getBindings().dash[0]);
      watchTouch([b], { arcade: () => undefined, actionBar: () => undefined } as unknown as RenderView);
      keyOn(b, 'keydown', 'Enter');
      b.remove();
      vi.advanceTimersByTime(250);
      expect(events).toEqual([`keydown:${code}`, `keyup:${code}`]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refreshes status words on a timer and stops once the buttons leave the page', () => {
    vi.useFakeTimers();
    try {
      const b = touchButton('Super');
      document.body.append(b);
      let meter = 250;
      const view = { arcade: () => ({ meter: [meter, 0] }), actionBar: () => undefined } as unknown as RenderView;
      watchTouch([b], view);
      vi.advanceTimersByTime(250);
      expect(b.textContent).toBe('9\nSuper\n25%');
      meter = 1000;
      vi.advanceTimersByTime(250);
      expect(b.textContent).toBe('9\nSuper\nready');
      b.remove();
      vi.advanceTimersByTime(250);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('key labels follow the fighting-game preset (screen-reader list and bar agree)', () => {
  it('names the preset primaries, not the default numbers', () => {
    setBindings(SF_PRESET_BINDINGS);
    expect(TOUCH.map((l) => touchKeyLabel(l))).toEqual(['O', 'I', 'L', 'U', 'H', 'N', 'M', 'P', 'Y', ';']);
    setBindings(DEFAULT_BINDINGS);
    expect(TOUCH.map((l) => touchKeyLabel(l))).toEqual(['9', '8', '7', '6', '5', '3', '4', '0', '-', '=']);
  });
});
