import { Cmd, type ObservationView } from '@core/index';
import { describe, expect, it } from 'vitest';
import {
  ACTION_LABELS, DEFAULT_BINDINGS, GAME_ACTIONS, RESERVED_CODES, actionForCode, bindSteal, parseBindings, tryBind,
} from '../platform/input/bindings';
import { ARCADE_PAD, DEFAULT_PAD, PadButton, commandFromPad, type PadSnapshot } from './gamepad';
import { ACTION_COMMAND, ARCADE_ONLY, commandFromHeld, type KeyInput } from './key-map';
import { KeyboardAgent } from './keyboard-agent';

// Arcade super, dash and guard input (FUN-DESIGN 2.5, 2.7, 2.8; WP-arcade-super-view, WP-arcade-defence-view): keyboard
// X, E and Q, pad RT, RB and LT, live only in an Arcade match.

const view = {} as ObservationView;
const key = (type: KeyInput['type'], code: string, shiftKey = false): KeyInput => ({ type, code, shiftKey, ctrlKey: false, repeat: false });
const pad = (pressed: number[]): PadSnapshot => ({
  connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
});
const bitsOf = (c: Record<number, number>): number[] => Object.values(c);

describe('super key binding: no conflicts', () => {
  it('defaults to plain X, a bindable key that no other action uses', () => {
    expect(DEFAULT_BINDINGS.super).toEqual(['KeyX']);
    expect(RESERVED_CODES.has('KeyX')).toBe(false);
    const codes = GAME_ACTIONS.flatMap((a) => [...DEFAULT_BINDINGS[a]]);
    expect(new Set(codes).size).toBe(codes.length);
    expect(actionForCode(DEFAULT_BINDINGS, 'KeyX')).toBe('super');
    expect(ACTION_LABELS.super).toMatch(/Arcade/);
  });
  it('each action drives its own command bit, the super one bit 13 only', () => {
    const bits = GAME_ACTIONS.map((a) => ACTION_COMMAND[a]);
    expect(new Set(bits).size).toBe(bits.length);
    expect(ACTION_COMMAND.super).toBe(Cmd.super);
  });
  it('rebinding detects a conflict with the super key both ways', () => {
    expect(tryBind(DEFAULT_BINDINGS, 'capture', 0, 'KeyX')).toEqual({ ok: false, reason: 'conflict', with: 'super' });
    expect(tryBind(DEFAULT_BINDINGS, 'super', 0, 'KeyC')).toEqual({ ok: false, reason: 'conflict', with: 'capture' });
    expect(tryBind(DEFAULT_BINDINGS, 'super', 0, 'KeyF')).toEqual({ ok: false, reason: 'reserved' });
  });
  it('a save from before the super keeps the player keys, even when it already uses X', () => {
    const b = parseBindings({ capture: ['KeyX'], up: ['KeyI'] });
    expect(b.capture).toEqual(['KeyX']);
    expect(b.up).toEqual(['KeyI']);
    expect(b.super).toEqual([]);
    expect(parseBindings({ up: ['KeyI'] }).super).toEqual(['KeyX']);
  });
});

describe('super key: Arcade only', () => {
  it('held X sends the super in Arcade and nothing in Classic', () => {
    const held = new Set(['KeyX']);
    expect(commandFromHeld(DEFAULT_BINDINGS, held, true, true)).toBe(Cmd.super);
    expect(commandFromHeld(DEFAULT_BINDINGS, held, true, false)).toBe(0);
    expect(commandFromHeld(DEFAULT_BINDINGS, held, true)).toBe(0);
  });
  it('the keyboard agent sends it only in Arcade, and Shift-X stays the tester cheat', () => {
    for (const arcade of [true, false]) {
      const effects: string[] = [];
      const agent = new KeyboardAgent({ capturable: () => false, cheatsEnabled: true, arcade, onEffect: (e) => effects.push(e) });
      agent.handle(key('down', 'KeyX', true));
      expect(agent.observe(view)).toBe(0);
      expect(effects).toEqual(['cheatX']);
      agent.handle(key('down', 'KeyX'));
      expect(agent.observe(view)).toBe(arcade ? Cmd.super : 0);
    }
  });
});

describe('super pad button: RT in Arcade, Classic pad unchanged', () => {
  it('Classic keeps RT as the fourth swap and never sends the super', () => {
    expect(DEFAULT_PAD.buttons[PadButton.rt]).toBe(Cmd.swap4);
    expect(bitsOf(DEFAULT_PAD.buttons)).not.toContain(Cmd.super);
    expect(commandFromPad(pad([PadButton.rt]), false)).toBe(Cmd.swap4);
  });
  it('Arcade RT is the super, RB the dash, LT the guard; every other button keeps its Classic bit, no two share one', () => {
    expect(commandFromPad(pad([PadButton.rt]), false, ARCADE_PAD)).toBe(Cmd.super);
    expect(commandFromPad(pad([PadButton.rb]), false, ARCADE_PAD)).toBe(Cmd.dash);
    expect(commandFromPad(pad([PadButton.lt]), false, ARCADE_PAD)).toBe(Cmd.guard);
    const arcadeOnly: number[] = [PadButton.rt, PadButton.rb, PadButton.lt];
    for (const [i, bit] of Object.entries(DEFAULT_PAD.buttons)) {
      if (!arcadeOnly.includes(Number(i))) expect(ARCADE_PAD.buttons[Number(i)]).toBe(bit);
    }
    const bits = bitsOf(ARCADE_PAD.buttons);
    expect(new Set(bits).size).toBe(bits.length);
    expect(ARCADE_PAD.pauseButton).toBe(DEFAULT_PAD.pauseButton);
  });
  it('the keyboard agent reads RT, RB and LT through the Arcade pad only in Arcade', () => {
    for (const arcade of [true, false]) {
      const agent = new KeyboardAgent({ capturable: () => false, arcade, gamepad: () => pad([PadButton.rt]) });
      expect(agent.observe(view)).toBe(arcade ? Cmd.super : Cmd.swap4);
      const both = new KeyboardAgent({ capturable: () => false, arcade, gamepad: () => pad([PadButton.rb, PadButton.lt]) });
      expect(both.observe(view)).toBe(arcade ? Cmd.dash | Cmd.guard : Cmd.swap2 | Cmd.swap3);
    }
  });
  it('Classic never sends a dash or guard bit from the pad', () => {
    expect(bitsOf(DEFAULT_PAD.buttons)).not.toContain(Cmd.dash);
    expect(bitsOf(DEFAULT_PAD.buttons)).not.toContain(Cmd.guard);
  });
});

describe('dash and guard keys (WP-arcade-defence-view): E and Q, rebindable, Arcade only', () => {
  it('default to plain E and Q, bindable keys no other action uses, labelled as Arcade actions', () => {
    expect(DEFAULT_BINDINGS.dash).toEqual(['KeyE']);
    expect(DEFAULT_BINDINGS.guard).toEqual(['KeyQ']);
    for (const c of ['KeyE', 'KeyQ']) expect(RESERVED_CODES.has(c)).toBe(false);
    expect(actionForCode(DEFAULT_BINDINGS, 'KeyE')).toBe('dash');
    expect(actionForCode(DEFAULT_BINDINGS, 'KeyQ')).toBe('guard');
    expect(ACTION_LABELS.dash).toBe('Dash (Arcade)');
    expect(ACTION_LABELS.guard).toBe('Guard (Arcade)');
    expect(ACTION_COMMAND.dash).toBe(Cmd.dash);
    expect(ACTION_COMMAND.guard).toBe(Cmd.guard);
  });
  it('rebinding detects conflicts both ways and moves a stolen key', () => {
    expect(tryBind(DEFAULT_BINDINGS, 'dash', 0, 'KeyQ')).toEqual({ ok: false, reason: 'conflict', with: 'guard' });
    expect(tryBind(DEFAULT_BINDINGS, 'guard', 0, 'KeyX')).toEqual({ ok: false, reason: 'conflict', with: 'super' });
    expect(tryBind(DEFAULT_BINDINGS, 'slot1', 1, 'KeyE')).toEqual({ ok: false, reason: 'conflict', with: 'dash' });
    expect(tryBind(DEFAULT_BINDINGS, 'guard', 0, 'Tab')).toEqual({ ok: false, reason: 'reserved' });
    const r = tryBind(DEFAULT_BINDINGS, 'dash', 0, 'ShiftLeft');
    expect(r.ok).toBe(false);
    const moved = bindSteal(DEFAULT_BINDINGS, 'dash', 0, 'KeyQ');
    expect(moved.dash).toEqual(['KeyQ']);
    expect(moved.guard).toEqual([]);
    const ok = tryBind(DEFAULT_BINDINGS, 'guard', 1, 'KeyG');
    expect(ok.ok && ok.bindings.guard).toEqual(['KeyQ', 'KeyG']);
  });
  it('a save from before keeps the player keys: E or Q already in use leaves the new action unbound', () => {
    const b = parseBindings({ slot1: ['KeyE'], capture: ['KeyQ'] });
    expect(b.slot1).toEqual(['KeyE']);
    expect(b.capture).toEqual(['KeyQ']);
    expect(b.dash).toEqual([]);
    expect(b.guard).toEqual([]);
    expect(parseBindings({ up: ['KeyI'] })).toMatchObject({ dash: ['KeyE'], guard: ['KeyQ'] });
  });
  it('held E and Q send dash and guard in Arcade only, and Shift-Q stays the tester cheat', () => {
    const held = new Set(['KeyE', 'KeyQ']);
    expect(commandFromHeld(DEFAULT_BINDINGS, held, true, true)).toBe(Cmd.dash | Cmd.guard);
    expect(commandFromHeld(DEFAULT_BINDINGS, held, true, false)).toBe(0);
    for (const arcade of [true, false]) {
      const effects: string[] = [];
      const agent = new KeyboardAgent({ capturable: () => false, cheatsEnabled: true, arcade, onEffect: (e) => effects.push(e) });
      agent.handle(key('down', 'KeyQ', true));
      expect(agent.observe(view)).toBe(0);
      expect(effects).toEqual(['cheatQ']);
      agent.handle(key('down', 'KeyQ'));
      agent.handle(key('down', 'KeyE'));
      expect(agent.observe(view)).toBe(arcade ? Cmd.guard | Cmd.dash : 0);
    }
  });
  it('every Arcade-only action sends a bit from the dash up, every Classic one a bit below it', () => {
    for (const a of GAME_ACTIONS) {
      const arcadeOnly = a === 'super' || a === 'dash' || a === 'guard';
      expect(ACTION_COMMAND[a] >= ARCADE_ONLY, a).toBe(arcadeOnly);
    }
  });
});
