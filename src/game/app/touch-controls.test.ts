import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderView } from '@core/index';
import { setBindings, DEFAULT_BINDINGS, getBindings } from '../platform/input/bindings';
import { TOUCH, isMeleeRace, setTouchText, touchButton, touchButtons, touchKeyLabel, touchStatus } from './touch-controls';

type Listener = (e: { pointerId: number; preventDefault: () => void; key?: string; repeat?: boolean; stopPropagation?: () => void }) => void;

/** A minimal button: the module only sets fields, adds listeners and captures the pointer. */
function fakeButton(): Record<string, unknown> {
  const listeners = new Map<string, Listener>();
  const attrs: Record<string, string> = {};
  return {
    style: {},
    className: '',
    textContent: '',
    listeners,
    addEventListener: (t: string, f: Listener) => listeners.set(t, f),
    setPointerCapture: vi.fn(),
    attrs,
    setAttribute: (k: string, v: string) => { attrs[k] = v; },
  };
}

function stubDom(coarse: boolean): { sent: string[] } {
  const sent: string[] = [];
  vi.stubGlobal('document', { createElement: fakeButton });
  vi.stubGlobal('matchMedia', () => ({ matches: coarse }));
  vi.stubGlobal('KeyboardEvent', class { constructor(readonly type: string, readonly init: { code: string }) {} });
  vi.stubGlobal('window', { dispatchEvent: (e: { type: string; init: { code: string } }) => sent.push(`${e.type}:${e.init.code}`) });
  return { sent };
}

afterEach(() => {
  vi.unstubAllGlobals();
  setBindings(DEFAULT_BINDINGS);
});

describe('touch controls', () => {
  it('builds 6, 7 or 8 buttons (Trap last) for 1, 2 or 3 heroes a side, in the TOUCH order, with Arcade ids', () => {
    stubDom(true);
    expect(TOUCH).toHaveLength(8);
    for (const n of [1, 2, 3] as const) expect(touchButtons(n)).toHaveLength(n + 5);
    const b = touchButtons(3);
    expect(b.map((x) => x.id)).toEqual(TOUCH.map((l) => `arcade${l}`));
    expect(b[6]?.textContent).toBe('4\nTag 2');
    expect(b[7]?.textContent).toBe('0\nTrap');
    expect(b.every((x) => x.tabIndex !== -1)).toBe(true);
  });

  it('puts layout in CSS classes and only the slot inline', () => {
    stubDom(true);
    expect(touchButton('Dash', 2).style.cssText).toBe('--touch-row:2');
    expect(touchButton('Dash', 2).className).toContain('touchBtn');
  });

  it('holds the bound key while the finger is down and releases it once', () => {
    const { sent } = stubDom(true);
    const b = touchButton('Super', 0) as unknown as { listeners: Map<string, Listener>; setPointerCapture: ReturnType<typeof vi.fn> };
    const down = b.listeners.get('pointerdown');
    const e = { pointerId: 7, preventDefault: vi.fn() };
    down?.(e);
    down?.(e);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/^keydown:/);
    expect(b.setPointerCapture).toHaveBeenCalledWith(7);
    b.listeners.get('pointerup')?.(e);
    b.listeners.get('lostpointercapture')?.(e);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatch(/^keyup:/);
  });
});

describe('keyboard activation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const key = (k: string, repeat = false) => ({ pointerId: 0, key: k, repeat, preventDefault: vi.fn(), stopPropagation: vi.fn() });
  it('Enter or Space holds the bound key like a finger and releases it on keyup, ignoring auto-repeat', () => {
    for (const k of ['Enter', ' ']) {
      const { sent } = stubDom(true);
      const b = touchButton('Dash', 0) as unknown as { listeners: Map<string, Listener> };
      const e = key(k);
      b.listeners.get('keydown')?.(e);
      b.listeners.get('keydown')?.(key(k, true));
      expect(sent).toEqual([`keydown:${String(getBindings().dash[0])}`]);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(e.stopPropagation).toHaveBeenCalled();
      b.listeners.get('keyup')?.(key(k));
      // A quick tap is held for at least 100 ms, so the sim sees the key down for a few ticks.
      expect(sent).toEqual([`keydown:${String(getBindings().dash[0])}`]);
      vi.advanceTimersByTime(100);
      expect(sent).toEqual([`keydown:${String(getBindings().dash[0])}`, `keyup:${String(getBindings().dash[0])}`]);
    }
  });
  it('a finger and a key hold the action separately: letting go of one does not release the other', () => {
    const { sent } = stubDom(true);
    const b = touchButton('Dash', 0) as unknown as { listeners: Map<string, Listener> };
    const code = String(getBindings().dash[0]);
    b.listeners.get('pointerdown')?.({ pointerId: 1, preventDefault: vi.fn() });
    b.listeners.get('keydown')?.(key('Enter'));
    vi.advanceTimersByTime(500);
    b.listeners.get('keyup')?.(key('Enter'));
    expect(sent).toEqual([`keydown:${code}`]);
    b.listeners.get('pointerup')?.(key(''));
    expect(sent).toEqual([`keydown:${code}`, `keyup:${code}`]);
  });
  it('ignores other keys and releases on blur', () => {
    const { sent } = stubDom(true);
    const b = touchButton('Guard', 0) as unknown as { listeners: Map<string, Listener> };
    b.listeners.get('keydown')?.(key('a'));
    expect(sent).toEqual([]);
    b.listeners.get('keydown')?.(key('Enter'));
    b.listeners.get('blur')?.(key(''));
    expect(sent).toEqual([`keydown:${String(getBindings().guard[0])}`, `keyup:${String(getBindings().guard[0])}`]);
  });
});

describe('numbered action row', () => {
  it('labels each button with its key number, Charge 5 to Super 9, Tag 3 and 4', () => {
    stubDom(true);
    expect(touchButtons(3).map((b) => b.textContent)).toEqual(['9\nSuper', '8\nGuard', '7\nDash', '6\nWeather', '5\nCharge', '3\nTag', '4\nTag 2', '0\nTrap']);
  });

  it('leaves Charge out when no hero is melee, keeps the other numbers and closes the gap in the layout', () => {
    stubDom(true);
    const b = touchButtons(2, [false, false]);
    expect(b.map((x) => x.textContent)).toEqual(['9\nSuper', '8\nGuard', '7\nDash', '6\nWeather', '3\nTag', '0\nTrap']);
    expect(b[4]?.style.cssText).toBe('--touch-row:4');
    expect(touchButtons(2, [false, true])).toHaveLength(7);
    expect(touchButtons(1)).toHaveLength(6);
  });

  it('shows the first key when the number key is rebound away', () => {
    stubDom(true);
    setBindings({ ...DEFAULT_BINDINGS, weather: ['KeyT'] });
    expect(touchKeyLabel('Weather')).toBe('T');
    expect(touchKeyLabel('Dash')).toBe('7');
  });

  it('puts the state in words on a second line and in the accessible name', () => {
    stubDom(false);
    const b = touchButton('Super', 0);
    setTouchText(b, 'Super', '40%');
    expect(b.textContent).toBe('9\nSuper\n40%');
    expect((b as unknown as { attrs: Record<string, string> }).attrs['aria-label']).toBe('9 Super, 40%');
    setTouchText(b, 'Super');
    expect(b.textContent).toBe('9\nSuper');
  });

  it('reads ready or a percentage for Super and Weather and the swap cooldown for Tag', () => {
    const view = (meter: number, charge: number, tick: number, ready: number): RenderView => ({
      arcade: () => ({ meter: [meter, 0], weatherCharge: [charge, 0] }),
      actionBar: () => ({ tick, swapReadyTick: ready }),
    }) as unknown as RenderView;
    expect(touchStatus('Super', view(1000, 0, 0, 0))).toBe('ready');
    expect(touchStatus('Super', view(250, 0, 0, 0))).toBe('25%');
    expect(touchStatus('Weather', view(0, 500, 0, 0))).toBe('50%');
    expect(touchStatus('Weather', view(0, 1000, 0, 0))).toBe('ready');
    expect(touchStatus('Tag', view(0, 0, 100, 175))).toBe('2s');
    expect(touchStatus('Tag2', view(0, 0, 100, 100))).toBe('ready');
  });

  it('reads the Dash and Charge cooldowns in seconds and the Guard meter in words; blank for a ranged Charge or no hero', () => {
    const view = (dash: number, charge: number, guard: number, guarding: boolean, id = 2): RenderView => ({
      arcade: () => ({ active: () => id, dashIn: () => dash, chargeIn: () => charge, guard: () => guard, guarding: () => guarding }),
    }) as unknown as RenderView;
    expect(touchStatus('Dash', view(0, 0, 1000, false))).toBe('ready');
    expect(touchStatus('Dash', view(30, 0, 1000, false))).toBe('1s');
    expect(touchStatus('Charge', view(0, 120, 1000, false))).toBe('3s');
    expect(touchStatus('Charge', view(0, 0, 1000, false))).toBe('ready');
    expect(touchStatus('Charge', view(0, -1, 1000, false))).toBe('');
    expect(touchStatus('Guard', view(0, 0, 1000, false))).toBe('ready');
    expect(touchStatus('Guard', view(0, 0, 400, false))).toBe('40%');
    expect(touchStatus('Guard', view(0, 0, 400, true))).toBe('guarding');
    expect(touchStatus('Dash', view(0, 0, 1000, false, -1))).toBe('');
    expect(touchStatus('Dash', { arcade: () => undefined } as unknown as RenderView)).toBe('');
  });

  it('classifies a race as melee by its primary ability, like the sim does for Charge (Rokcore melee, Sindarosa ranged)', () => {
    expect(isMeleeRace('rokcore' as never)).toBe(true);
    expect(isMeleeRace('sindarosa' as never)).toBe(false);
  });
});
