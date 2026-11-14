import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BINDINGS,
  GAME_ACTIONS,
  SHARED_CODE,
  SF_PRESET_BINDINGS,
  actionKeyLabel,
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
    const r = tryBind(DEFAULT_BINDINGS, 'capture', 0, 'KeyG');
    expect(r.ok && r.bindings.capture).toEqual(['KeyG']);
  });
  it('adds an alternate in slot 1', () => {
    const r = tryBind(DEFAULT_BINDINGS, 'capture', 1, 'KeyG');
    expect(r.ok && r.bindings.capture).toEqual(['KeyC', 'KeyG']);
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
    const codes = allCodes(stolen).filter((c) => c !== SHARED_CODE);
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

describe('default keys', () => {
  // Legacy is positional (digit N = action-bar slot N: 3 = Capture from chapter 2, else Swap1); the port keeps fixed keys
  // pending owner sign-off (docs/PARITY.md U14).
  it('Capture is C and digits 3 to 5 are Swap 1 to 3 in every chapter', () => {
    expect(DEFAULT_BINDINGS.capture).toEqual(['KeyC']);
    expect([DEFAULT_BINDINGS.slot3, DEFAULT_BINDINGS.slot4, DEFAULT_BINDINGS.slot5]).toEqual([['Digit3'], ['Digit4'], ['Digit5']]);
    expect(actionForCode(DEFAULT_BINDINGS, 'Digit3')).toBe('slot3');
  });
  it('the numbered action row: 5 Charge, 6 Weather, 7 Dash, 8 Guard, 9 Super, beside the letter keys', () => {
    expect(DEFAULT_BINDINGS.charge).toEqual(['KeyH', 'Digit5']);
    expect(DEFAULT_BINDINGS.weather).toEqual(['KeyR', 'Digit6']);
    expect(DEFAULT_BINDINGS.dash).toEqual(['KeyE', 'Digit7']);
    expect(DEFAULT_BINDINGS.guard).toEqual(['KeyQ', 'Digit8']);
    expect(DEFAULT_BINDINGS.super).toEqual(['KeyX', 'Digit9']);
  });
  it('Digit5 is the only code two default actions share (Swap 3 in Classic, Charge in Arcade); it survives round trips and rebinds', () => {
    const seen = new Map<string, number>();
    for (const a of GAME_ACTIONS) for (const c of DEFAULT_BINDINGS[a]) seen.set(c, (seen.get(c) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1)).toEqual([[SHARED_CODE, 2]]);
    expect(parseBindings(JSON.parse(JSON.stringify(bindingsToSave(bindSteal(DEFAULT_BINDINGS, 'capture', 0, 'KeyV')))) as unknown).charge).toEqual(['KeyH', 'Digit5']);
    // Re-binding either owner to Digit5 is not a conflict with the other, and does not take it away.
    const again = tryBind(DEFAULT_BINDINGS, 'slot5', 0, 'Digit5');
    expect(again.ok && again.bindings.charge).toEqual(['KeyH', 'Digit5']);
    const other = tryBind(DEFAULT_BINDINGS, 'charge', 1, 'Digit5');
    expect(other.ok && other.bindings.slot5).toEqual(['Digit5']);
    // Any other action taking Digit5 is a conflict with slot5, and stealing it leaves Charge's own copy alone.
    expect(tryBind(DEFAULT_BINDINGS, 'capture', 0, 'Digit5')).toEqual({ ok: false, reason: 'conflict', with: 'slot5' });
    expect(tryBind(DEFAULT_BINDINGS, 'capture', 0, 'Digit7')).toEqual({ ok: false, reason: 'conflict', with: 'dash' });
  });
  it('a customised save is left alone: no digit alternates are added to actions it names', () => {
    const b = parseBindings({ charge: ['KeyJ'], slot5: ['Digit5'], weather: ['KeyR'] });
    expect(b.charge).toEqual(['KeyJ']);
    expect(b.weather).toEqual(['KeyR']);
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
    const codes = allCodes(b).filter((c) => c !== SHARED_CODE);
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

describe('the fighting-game preset', () => {
  it('is a complete layout: every action has a key, no code is shared (but Digit5), and it survives a save', () => {
    for (const a of GAME_ACTIONS) expect(SF_PRESET_BINDINGS[a].length, a).toBeGreaterThan(0);
    const codes = allCodes(SF_PRESET_BINDINGS);
    expect(codes.filter((c, i) => codes.indexOf(c) !== i)).toEqual([SHARED_CODE]);
    expect(parseBindings(bindingsToSave(SF_PRESET_BINDINGS))).toEqual(SF_PRESET_BINDINGS);
  });
  it('moves Tag, Trap and Cleanse off the default keys and the hints name the bound key', () => {
    const name = (a: Parameters<typeof actionKeyLabel>[1]): string | undefined => actionKeyLabel(SF_PRESET_BINDINGS, a);
    expect([name('slot3'), name('slot4'), name('slot5')]).toEqual(['N', 'M', 'Comma']);
    expect([name('trap'), name('cleanse'), name('elemental')]).toEqual(['P', 'Semicolon', 'Y']);
    expect([name('super'), name('dash'), name('guard'), name('weather')]).toEqual(['O', 'L', 'I', 'U']);
    expect(actionKeyLabel(DEFAULT_BINDINGS, 'slot3')).toBe('3');
    expect(actionKeyLabel(DEFAULT_BINDINGS, 'super')).toBe('9');
  });
});
