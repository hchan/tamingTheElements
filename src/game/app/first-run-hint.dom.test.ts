// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIRST_RUN_KEY, firstRunHint, firstRunLines, firstRunSeen } from './first-run-hint';
import { labelsFromBindings } from '../hud/action-bar';
import { DEFAULT_BINDINGS, actionKeyLabel } from '../platform/input/bindings';

const memory = (): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('firstRunHint', () => {
  it('shows on a fresh store, in words, and Got it removes it and remembers', () => {
    const store = memory();
    const card = firstRunHint(store);
    expect(card).not.toBeNull();
    document.body.append(card as HTMLElement);
    expect(card?.textContent).toContain('First blood');
    expect(card?.textContent).not.toMatch(/classic|arcade|ruleset|capture/i);
    card?.querySelector('button')?.click();
    expect(document.getElementById('firstRunHint')).toBeNull();
    expect(store.data.get(FIRST_RUN_KEY)).toBe('1');
    expect(firstRunSeen(store)).toBe(true);
    expect(firstRunHint(store)).toBeNull();
  });

  it('stays hidden and does not start its fade timer until the arena is ready', () => {
    vi.useFakeTimers();
    const store = memory();
    let ready = (): void => undefined;
    const card = firstRunHint(store, 1000, (go) => { ready = go; });
    vi.advanceTimersByTime(5000);
    expect(card?.classList.contains('firstRunWait')).toBe(true);
    expect(firstRunSeen(store)).toBe(false);
    ready();
    expect(card?.classList.contains('firstRunWait')).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(firstRunSeen(store)).toBe(true);
  });

  it('fades and counts as seen after the timer', () => {
    vi.useFakeTimers();
    const store = memory();
    const card = firstRunHint(store, 1000);
    vi.advanceTimersByTime(1000);
    expect(card?.classList.contains('firstRunFade')).toBe(true);
    expect(firstRunSeen(store)).toBe(true);
  });

  it('fades at the first key or tap outside the card, but not on Tab', () => {
    const store = memory();
    const card = firstRunHint(store);
    document.body.append(card as HTMLElement);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(card?.classList.contains('firstRunFade')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(card?.classList.contains('firstRunFade')).toBe(true);
    expect(firstRunSeen(store)).toBe(true);
  });

  it('survives a throwing store: reads as unseen and never throws', () => {
    const bad = {
      getItem: (): string | null => {
        throw new Error('no');
      },
      setItem: (): void => {
        throw new Error('no');
      },
    };
    expect(firstRunSeen(bad)).toBe(false);
    expect(() => firstRunHint(bad)?.querySelector('button')?.click()).not.toThrow();
  });

  it('names the live keys', () => {
    expect(firstRunLines({ ...DEFAULT_BINDINGS, dash: ['KeyV'] }).join(' ')).toContain('Dash with V');
  });

  it('names every key exactly as the action bar labels it (Dash 7, Guard 8, Super 9, Tag 3, Cleanse =)', () => {
    const text = firstRunLines(DEFAULT_BINDINGS).join(' ');
    expect(text).toContain('Strike with 1 or Space (2 or Enter: second attack).');
    expect(text).toContain('Dash with 7;');
    expect(text).toContain('hold 8 to Guard');
    expect(text).toContain('press 9.');
    expect(text).toContain('Tag with 3 ');
    expect(text).toContain('Press = to Cleanse');
    for (const a of ['slot1', 'dash', 'guard', 'super', 'slot3', 'cleanse'] as const) expect(actionKeyLabel(DEFAULT_BINDINGS, a)).toBeDefined();
    expect(Object.values(labelsFromBindings(DEFAULT_BINDINGS))).toEqual(expect.arrayContaining(['7', '8', '9', '=']));
  });

  it('describes the touch controls on a touch device and the live keys otherwise', () => {
    const touch = firstRunLines(DEFAULT_BINDINGS, true).join(' ');
    expect(touch).toMatch(/stick/i);
    expect(touch).not.toMatch(/WASD|arrows|press /i);
    const keys = firstRunLines(DEFAULT_BINDINGS).join(' ');
    expect(keys).toContain('Up/W');
    expect(keys).not.toMatch(/stick|tap/i);
    expect(keys + touch).not.toMatch(/classic|arcade|ruleset|capture/i);
  });
});
