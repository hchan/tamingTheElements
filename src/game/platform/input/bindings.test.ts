import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BINDINGS,
  GAME_ACTIONS,
  actionForCode,
  bindSteal,
  bindingsToSave,
  clearAlternate,
  codeLabel,
  parseBindings,
  resetBindings,
  sameBindings,
  tryBind,
  type Bindings,
} from './bindings';

function allCodes(b: Bindings): string[] {
  return GAME_ACTIONS.flatMap((a) => [...b[a]]);
}

describe('tryBind', () => {
  it('replaces the primary key of an action', () => {
    const r = tryBind(DEFAULT_BINDINGS, 'capture', 0, 'KeyV');
    expect(r.ok && r.bindings.capture).toEqual(['KeyV']);
  });
  it('adds an alternate in slot 1', () => {
    const r = tryBind(DEFAULT_BINDINGS, 'capture', 1, 'KeyV');
    expect(r.ok && r.bindings.capture).toEqual(['KeyC', 'KeyV']);
  });
  it('detects a conflict with another action and changes nothing', () => {
    const r = tryBind(DEFAULT_BINDINGS, 'capture', 0, 'KeyW');
    expect(r).toEqual({ ok: false, reason: 'conflict', with: 'up' });
  });
  it('rebinding an action to a key it already owns is fine', () => {
    expect(tryBind(DEFAULT_BINDINGS, 'up', 1, 'KeyW').ok).toBe(true);
  });
  it('rejects reserved and malformed codes', () => {
    for (const c of ['Escape', 'KeyF', 'Tab', 'ShiftLeft', 'ControlRight', '', 'a b', 'x'.repeat(40)]) {
      expect(tryBind(DEFAULT_BINDINGS, 'up', 0, c)).toEqual({ ok: false, reason: 'reserved' });
    }
  });
  it('never leaves a code on two actions', () => {
    const stolen = bindSteal(DEFAULT_BINDINGS, 'capture', 0, 'KeyW');
    expect(stolen.capture).toEqual(['KeyW']);
    expect(stolen.up).toEqual(['ArrowUp']);
    const codes = allCodes(stolen);
    expect(new Set(codes).size).toBe(codes.length);
    expect(actionForCode(stolen, 'KeyW')).toBe('capture');
  });
});

describe('clear, reset and compare', () => {
  it('clearAlternate keeps only the primary', () => {
    expect(clearAlternate(DEFAULT_BINDINGS, 'up').up).toEqual(['ArrowUp']);
  });
  it('reset returns the defaults', () => {
    const changed = bindSteal(DEFAULT_BINDINGS, 'capture', 0, 'KeyV');
    expect(sameBindings(changed, DEFAULT_BINDINGS)).toBe(false);
    expect(sameBindings(resetBindings(), DEFAULT_BINDINGS)).toBe(true);
  });
});

describe('save round trip', () => {
  it('defaults serialise to nothing', () => {
    expect(bindingsToSave(DEFAULT_BINDINGS)).toBeUndefined();
  });
  it('custom bindings round-trip through JSON', () => {
    const custom = bindSteal(DEFAULT_BINDINGS, 'capture', 0, 'KeyV');
    const stored = bindingsToSave(custom);
    expect(parseBindings(JSON.parse(JSON.stringify(stored)) as unknown)).toEqual(custom);
  });
  it('garbage falls back to the defaults', () => {
    for (const raw of [undefined, null, 5, 'x', [], { up: 3 }]) {
      expect(parseBindings(raw)).toEqual(DEFAULT_BINDINGS);
    }
  });
  it('drops duplicates, reserved codes and unknown actions, and fills empty actions', () => {
    const b = parseBindings({
      up: ['KeyW', 'Escape', 7],
      down: ['KeyW'],
      capture: [],
      nonsense: ['KeyZ'],
    });
    expect(b.up).toEqual(['KeyW']);
    expect(b.down).toEqual(['ArrowDown', 'KeyS']);
    expect(b.capture).toEqual(['KeyC']);
    const codes = allCodes(b);
    expect(new Set(codes).size).toBe(codes.length);
    for (const a of GAME_ACTIONS) expect(b[a].length).toBeGreaterThan(0);
  });
});

describe('codeLabel', () => {
  it('shortens common codes', () => {
    expect(codeLabel('KeyW')).toBe('W');
    expect(codeLabel('Digit1')).toBe('1');
    expect(codeLabel('ArrowUp')).toBe('Up');
    expect(codeLabel('Space')).toBe('Space');
  });
});
