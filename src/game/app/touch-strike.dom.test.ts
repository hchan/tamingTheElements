// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, SF_PRESET_BINDINGS, setBindings } from '../platform/input/bindings';
import { strikeKey, touchStrikes } from './touch-strike';

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

describe('touch strike buttons', () => {
  it('are two labelled buttons, Strike 2 before Strike 1 in the DOM (visual Tab order)', () => {
    const box = touchStrikes();
    const ids = [...box.querySelectorAll('button')].map((b) => b.id);
    expect(ids).toEqual(['touchStrike2', 'touchStrike1']);
    expect(box.querySelector('#touchStrike1')?.textContent).toBe('Strike1');
    expect(box.querySelector('#touchStrike1')?.getAttribute('aria-label')).toBe('1 Strike');
  });
  it('hold the key of the bar slot while the finger is down, and let go on lift', () => {
    const box = touchStrikes();
    document.body.append(box);
    const b = box.querySelector<HTMLButtonElement>('#touchStrike1');
    if (!b) throw new Error('no button');
    b.setPointerCapture = () => undefined;
    const fire = (type: string): void => {
      const e = new Event(type, { cancelable: true, bubbles: true });
      Object.assign(e, { pointerId: 1 });
      b.dispatchEvent(e);
    };
    fire('pointerdown');
    expect(events).toEqual(['keydown:Digit1']);
    fire('pointerup');
    expect(events).toEqual(['keydown:Digit1', 'keyup:Digit1']);
  });
  it('wear the bound key name of a layout preset', () => {
    setBindings(SF_PRESET_BINDINGS);
    expect(strikeKey('slot1', 1)).not.toBe('');
  });
});
