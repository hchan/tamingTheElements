import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, INITIAL_KEY_STATE, reduceKey, type KeyInput, type KeyState } from './key-map';

const key = (type: KeyInput['type'], code: string, over: Partial<KeyInput> = {}): KeyInput => ({
  type, code, shiftKey: false, ctrlKey: false, repeat: false, ...over,
});
const press = (s: KeyState, code: string, over: Partial<KeyInput> = {}, cheats = false) =>
  reduceKey(s, key('down', code, over), DEFAULT_BINDINGS, cheats);

describe('reduceKey', () => {
  it('tracks held keys on down and up, and ignores a repeat or a release of an unheld key', () => {
    const a = press(INITIAL_KEY_STATE, 'KeyW');
    expect([...a.state.held]).toEqual(['KeyW']);
    expect(a.effect).toBeUndefined();
    const again = press(a.state, 'KeyW', { repeat: true });
    expect(again.state).toBe(a.state);
    const stray = reduceKey(a.state, key('up', 'KeyZ'), DEFAULT_BINDINGS, false);
    expect(stray.state).toBe(a.state);
    const up = reduceKey(a.state, key('up', 'KeyW'), DEFAULT_BINDINGS, false);
    expect(up.state.held.size).toBe(0);
    expect(a.state.held.size).toBe(1); // the previous state is never mutated
  });

  it('blur releases everything (a key held while the tab lost focus cannot stick)', () => {
    const s = press(press(INITIAL_KEY_STATE, 'KeyW').state, 'Space').state;
    expect(reduceKey(s, key('blur', ''), DEFAULT_BINDINGS, false).state.held.size).toBe(0);
  });

  it('Shift-P pauses and Ctrl-M mutes once per physical press, and neither becomes a held key', () => {
    const p = press(INITIAL_KEY_STATE, 'KeyP', { shiftKey: true });
    expect(p.effect).toBe('pause');
    expect(p.state.held.size).toBe(0);
    expect(press(INITIAL_KEY_STATE, 'KeyP', { shiftKey: true, repeat: true }).effect).toBeUndefined();
    expect(press(INITIAL_KEY_STATE, 'KeyM', { ctrlKey: true }).effect).toBe('mute');
    expect(press(INITIAL_KEY_STATE, 'KeyM', { ctrlKey: true, repeat: true }).effect).toBeUndefined();
  });

  it('plain P and plain M are ordinary held keys, not shortcuts', () => {
    for (const code of ['KeyP', 'KeyM']) {
      const r = press(INITIAL_KEY_STATE, code);
      expect(r.effect).toBeUndefined();
      expect(r.state.held.has(code)).toBe(true);
    }
  });

  it('Shift-Q/X/C are tester cheats only when cheats are enabled; otherwise they are held keys', () => {
    for (const [code, effect] of [['KeyQ', 'cheatQ'], ['KeyX', 'cheatX'], ['KeyC', 'cheatC']] as const) {
      expect(press(INITIAL_KEY_STATE, code, { shiftKey: true }, true).effect).toBe(effect);
      const off = press(INITIAL_KEY_STATE, code, { shiftKey: true }, false);
      expect(off.effect).toBeUndefined();
      expect(off.state.held.has(code)).toBe(true);
      // The unshifted key stays the gameplay action even with cheats on.
      expect(press(INITIAL_KEY_STATE, code, {}, true).effect).toBeUndefined();
    }
    expect(press(INITIAL_KEY_STATE, 'KeyX', { shiftKey: true, repeat: true }, true).effect).toBeUndefined();
  });

  it('the default bindings never use the shortcut codes P (pause)', () => {
    expect(new Set(Object.values(DEFAULT_BINDINGS).flat()).has('KeyP')).toBe(false);
  });
});
