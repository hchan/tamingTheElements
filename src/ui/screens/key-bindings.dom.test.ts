// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newEmptyState, type SaveV1 } from '@core/menu-index';
import { DEFAULT_BINDINGS, getBindings, setBindings } from '../../game/platform/input/bindings';
import type { SaveStore } from '../../game/platform/storage/save-store';
import { keyBindingsScreen } from './key-bindings';
import type { Screen } from './screen';

const STORAGE_KEY = 'Taming the Elements';

function fakeStore(): SaveStore & { saved: SaveV1[] } {
  const saved: SaveV1[] = [];
  return {
    saved,
    load: () => Promise.resolve({ ok: true as const, value: newEmptyState() }),
    save: (s) => {
      saved.push(s);
      return Promise.resolve({ ok: true as const, value: s });
    },
    clear: () => Promise.resolve(),
    exportJson: () => Promise.resolve({ ok: true as const, value: '' }),
    importJson: () => Promise.reject(new Error('unused')),
  };
}

let screen: Screen | undefined;
let root: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  setBindings(DEFAULT_BINDINGS);
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
  setBindings(DEFAULT_BINDINGS);
});

const press = (code: string, repeat = false): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { code, repeat, cancelable: true, bubbles: true });
  window.dispatchEvent(e);
  return e;
};
const btn = (id: string): HTMLButtonElement => {
  const b = document.getElementById(id);
  if (!(b instanceof HTMLButtonElement)) throw new Error(`no button ${id}`);
  return b;
};
const status = (): string => root.querySelector('[role="status"]')?.textContent ?? '';
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('keyBindingsScreen (DOM)', () => {
  it('renders one row per rebindable action with two key buttons and descriptive aria-labels', () => {
    screen = keyBindingsScreen();
    screen.mount(root);
    expect(root.querySelector('h1')?.textContent).toBe('Key Bindings');
    const rows = root.querySelectorAll('table.keyBindingTable')[0]?.querySelectorAll('tbody tr');
    expect(rows?.length).toBeGreaterThan(5);
    expect(document.getElementById('bind-capture-0')).toBeNull();
    const b = btn('bind-dash-0');
    expect(b.getAttribute('aria-label')).toMatch(/^Dash, key: .+\. Activate to change\.$/);
    expect(btn('bind-dash-1').getAttribute('aria-label')).toContain('alternate key');
    expect(root.querySelector('a.menuLink')?.getAttribute('href')).toBe('#main');
  });

  it('click then a key rebinds, announces, persists to localStorage and refocuses the button', async () => {
    screen = keyBindingsScreen();
    screen.mount(root);
    btn('bind-dash-0').click();
    expect(btn('bind-dash-0').textContent).toBe('Press a key...');
    expect(status()).toContain('Press the new key');
    expect(press('KeyG').defaultPrevented).toBe(true);
    expect(getBindings().dash[0]).toBe('KeyG');
    expect(btn('bind-dash-0').textContent).toBe('G');
    expect(status()).toContain('is now G');
    expect(document.activeElement?.id).toBe('bind-dash-0');
    await flush();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as SaveV1;
    expect(stored.keyBindings?.['dash']?.[0]).toBe('KeyG');
  });

  it('persists through the shared SaveStore when given one', async () => {
    const store = fakeStore();
    screen = keyBindingsScreen(store);
    screen.mount(root);
    btn('bind-dash-0').click();
    press('KeyG');
    await flush();
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]?.keyBindings?.['dash']?.[0]).toBe('KeyG');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('Escape cancels without changing anything; key repeat is ignored', () => {
    screen = keyBindingsScreen();
    screen.mount(root);
    const before = getBindings();
    btn('bind-dash-0').click();
    press('KeyG', true);
    expect(btn('bind-dash-0').textContent).toBe('Press a key...');
    press('Escape');
    expect(status()).toBe('Cancelled.');
    expect(getBindings()).toEqual(before);
    expect(document.activeElement?.id).toBe('bind-dash-0');
  });

  it('a reserved key is refused and capture continues', () => {
    screen = keyBindingsScreen();
    screen.mount(root);
    btn('bind-dash-0').click();
    press('KeyF'); // reserved: fullscreen toggle
    expect(status()).toContain('cannot be used');
    expect(btn('bind-dash-0').textContent).toBe('Press a key...');
    press('KeyG');
    expect(getBindings().dash[0]).toBe('KeyG');
  });

  it('Tab leaves capture mode without blocking focus movement', () => {
    screen = keyBindingsScreen();
    screen.mount(root);
    btn('bind-dash-0').click();
    expect(press('Tab').defaultPrevented).toBe(false);
    expect(btn('bind-dash-0').textContent).not.toBe('Press a key...');
    // capture listener is gone: a later key does nothing
    expect(press('KeyG').defaultPrevented).toBe(false);
  });

  it('Backspace clears an alternate key but not a primary one', () => {
    setBindings({ ...DEFAULT_BINDINGS, dash: ['KeyE', 'KeyF'] });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...newEmptyState(), keyBindings: { dash: ['KeyE', 'KeyF'] } }));
    screen = keyBindingsScreen();
    screen.mount(root);
    btn('bind-dash-1').click();
    press('Backspace');
    expect(getBindings().dash).toEqual(['KeyE']);
    expect(btn('bind-dash-1').textContent).toBe('None');
    expect(status()).toContain('alternate key cleared');
    btn('bind-dash-0').click();
    press('Backspace');
    // Backspace as the primary is just a key to bind (or reserved), never a clear
    expect(getBindings().dash[0]).not.toBeUndefined();
  });

  it('a conflict offers Move; clicking it takes the key from the other action', () => {
    screen = keyBindingsScreen();
    screen.mount(root);
    const owner = getBindings().guard[0] as string;
    btn('bind-dash-0').click();
    press(owner);
    expect(status()).toContain('is already used by');
    expect(getBindings().guard[0]).toBe(owner);
    const move = root.querySelector<HTMLButtonElement>('[role="status"] button');
    expect(move).not.toBeNull();
    expect(document.activeElement).toBe(move);
    move?.click();
    expect(getBindings().dash[0]).toBe(owner);
    expect(getBindings().guard).not.toContain(owner);
    expect(status()).toContain('lost that key');
  });

  it('Reset to defaults restores bindings and announces', () => {
    screen = keyBindingsScreen();
    screen.mount(root);
    btn('bind-dash-0').click();
    press('KeyG');
    btn('resetBindings').click();
    expect(getBindings()).toEqual(DEFAULT_BINDINGS);
    expect(status()).toBe('Key bindings reset to defaults.');
  });

  it('loads saved bindings on mount, and unmount stops a capture in progress', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...newEmptyState(), keyBindings: { dash: ['KeyQ'] } }));
    screen = keyBindingsScreen();
    screen.mount(root);
    expect(btn('bind-dash-0').textContent).toBe('Q');
    btn('bind-dash-0').click();
    screen.unmount();
    expect(press('KeyG').defaultPrevented).toBe(false);
    expect(root.children).toHaveLength(0);
  });
});
