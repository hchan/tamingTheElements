import { Cmd, type ObservationView } from '@core/index';
import { describe, expect, it } from 'vitest';
import {
  ACTION_LABELS, DEFAULT_BINDINGS, GAME_ACTIONS, RESERVED_CODES, actionForCode, parseBindings, tryBind,
} from '../platform/input/bindings';
import { ARCADE_PAD, DEFAULT_PAD, PadButton, commandFromPad, type PadSnapshot } from './gamepad';
import { ACTION_COMMAND, commandFromHeld, type KeyInput } from './key-map';
import { KeyboardAgent } from './keyboard-agent';

// Arcade super input (FUN-DESIGN 2.5, WP-arcade-super-view): keyboard X and pad RT, live only in an Arcade match.

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
  it('Arcade RT is the super; every other button keeps its Classic bit, and no two buttons share one', () => {
    expect(commandFromPad(pad([PadButton.rt]), false, ARCADE_PAD)).toBe(Cmd.super);
    for (const [i, bit] of Object.entries(DEFAULT_PAD.buttons)) {
      if (Number(i) !== PadButton.rt) expect(ARCADE_PAD.buttons[Number(i)]).toBe(bit);
    }
    const bits = bitsOf(ARCADE_PAD.buttons);
    expect(new Set(bits).size).toBe(bits.length);
    expect(ARCADE_PAD.pauseButton).toBe(DEFAULT_PAD.pauseButton);
  });
  it('the keyboard agent reads RT through the Arcade pad only in Arcade', () => {
    for (const arcade of [true, false]) {
      const agent = new KeyboardAgent({ capturable: () => false, arcade, gamepad: () => pad([PadButton.rt]) });
      expect(agent.observe(view)).toBe(arcade ? Cmd.super : Cmd.swap4);
    }
  });
});
