// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BINDINGS, GAME_ACTIONS, RESERVED_CODES, setBindings } from '../../game/platform/input/bindings';
import { PAD_ROWS, setPadOverrides } from '../../game/platform/input/pad-bindings';
import { KEY_BINDINGS, keyBindingsScreen } from './key-bindings';
import type { Screen } from './screen';

/** Remap-coverage audit, screen side: a binding that exists in the game but not on the Key Bindings screen fails here (pad half: src/game/input/pad-remap-coverage.test.ts). */

/** Actions deliberately absent from the screen: none (Snag is listed). */
const NOT_ON_SCREEN: ReadonlySet<string> = new Set();
const BANNED = /classic|arcade|ruleset|capture/i;

let screen: Screen | undefined;
let root: HTMLElement;
beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  setBindings(DEFAULT_BINDINGS);
  setPadOverrides({});
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
  root = document.createElement('div');
  document.body.append(root);
  screen = keyBindingsScreen();
  screen.mount(root);
  await vi.dynamicImportSettled();
});
afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
  setBindings(DEFAULT_BINDINGS);
  setPadOverrides({});
  vi.useRealTimers();
});

describe('remap coverage', () => {
  it('every keyboard game action has a key and an alternate button on the screen', () => {
    for (const a of GAME_ACTIONS) {
      if (NOT_ON_SCREEN.has(a)) {
        expect(document.getElementById(`bind-${a}-0`)).toBeNull();
        continue;
      }
      expect(document.getElementById(`bind-${a}-0`), `bind-${a}-0`).not.toBeNull();
      expect(document.getElementById(`bind-${a}-1`), `bind-${a}-1`).not.toBeNull();
    }
  });

  it('every gamepad row has a button on the screen', () => {
    for (const r of PAD_ROWS) expect(document.getElementById(`pad-${r.id}`), `pad-${r.id}`).not.toBeNull();
  });

  it('fixed menu and shell keys are listed on the screen and cannot be bound to a game action', () => {
    const text = root.textContent;
    for (const b of KEY_BINDINGS) {
      expect(text).toContain(b.action);
      for (const k of b.keys) expect(text).toContain(k);
    }
    expect(RESERVED_CODES.has('Escape')).toBe(true);
    expect(RESERVED_CODES.has('KeyF')).toBe(true);
    for (const a of GAME_ACTIONS) expect(DEFAULT_BINDINGS[a].filter((c) => RESERVED_CODES.has(c))).toEqual([]);
  });

  it('shows no forbidden words', () => {
    expect(root.textContent).not.toMatch(BANNED);
  });
});
