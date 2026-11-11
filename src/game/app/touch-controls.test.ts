import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOUCH, touchButton, touchButtons } from './touch-controls';

type Listener = (e: { pointerId: number; preventDefault: () => void }) => void;

/** A minimal button: the module only sets fields, adds listeners and captures the pointer. */
function fakeButton(): Record<string, unknown> {
  const listeners = new Map<string, Listener>();
  return {
    style: {},
    className: '',
    textContent: '',
    listeners,
    addEventListener: (t: string, f: Listener) => listeners.set(t, f),
    setPointerCapture: vi.fn(),
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

afterEach(() => vi.unstubAllGlobals());

describe('touch controls', () => {
  it('builds 5, 6 or 7 buttons for 1, 2 or 3 heroes a side, in the TOUCH order, with Arcade ids', () => {
    stubDom(true);
    expect(TOUCH).toHaveLength(7);
    for (const n of [1, 2, 3] as const) expect(touchButtons(n)).toHaveLength(n + 4);
    const b = touchButtons(3);
    expect(b.map((x) => x.id)).toEqual(TOUCH.map((l) => `arcade${l}`));
    expect(b[6]?.textContent).toBe('Tag 2');
    expect(b.every((x) => x.tabIndex === -1)).toBe(true);
  });

  it('lays out a right-edge column on coarse pointers and a bottom row otherwise', () => {
    stubDom(true);
    expect(touchButton('Dash', 2).style.cssText).toContain('bottom:calc(max(8px,env(safe-area-inset-bottom)) + 112px)');
    stubDom(false);
    expect(touchButton('Dash', 2).style.cssText).toContain('right:140px;bottom:2px');
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
