import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(b[6]?.textContent).toBe('4 Tag 2');
    expect(b[7]?.textContent).toBe('0 Trap');
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
      expect(sent).toEqual([`keydown:${String(getBindings().dash[0])}`, `keyup:${String(getBindings().dash[0])}`]);
    }
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
    expect(touchButtons(3).map((b) => b.textContent)).toEqual(['9 Super', '8 Guard', '7 Dash', '6 Weather', '5 Charge', '3 Tag', '4 Tag 2', '0 Trap']);
  });

  it('leaves Charge out when no hero is melee, keeps the other numbers and closes the gap in the layout', () => {
    stubDom(true);
    const b = touchButtons(2, [false, false]);
    expect(b.map((x) => x.textContent)).toEqual(['9 Super', '8 Guard', '7 Dash', '6 Weather', '3 Tag', '0 Trap']);
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
    expect(b.textContent).toBe('9 Super\n40%');
    expect((b as unknown as { attrs: Record<string, string> }).attrs['aria-label']).toBe('9 Super, 40%');
    setTouchText(b, 'Super');
    expect(b.textContent).toBe('9 Super');
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
    expect(touchStatus('Dash', view(0, 0, 0, 0))).toBe('');
  });

  it('classifies a race as melee by its primary ability, like the sim does for Charge (Rokcore melee, Sindarosa ranged)', () => {
    expect(isMeleeRace('rokcore' as never)).toBe(true);
    expect(isMeleeRace('sindarosa' as never)).toBe(false);
  });
});
