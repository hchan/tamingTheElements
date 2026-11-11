import { Cmd } from '@core/index';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, GAME_ACTIONS, isBindableCode, type GameAction } from '../platform/input/bindings';
import { nthPad, type PadSnapshot } from './gamepad';
import { commandFromHeld } from './key-map';
import { KeyboardAgent } from './keyboard-agent';
import { P2_BINDINGS, boundCodes, controlsHint } from './local-two';

describe('local two-player key sets', () => {
  it('no key is bound twice, within Player 2 or across both players', () => {
    const p2 = boundCodes(P2_BINDINGS);
    expect(new Set(p2).size).toBe(p2.length);
    const p1 = new Set(boundCodes(DEFAULT_BINDINGS));
    expect(p2.filter((c) => p1.has(c))).toEqual([]);
  });
  it('every Player 2 key is bindable (not F, Escape, Tab or a modifier) and not a shell or cheat key', () => {
    for (const c of boundCodes(P2_BINDINGS)) {
      expect(isBindableCode(c), c).toBe(true);
      expect(['KeyP', 'KeyM']).not.toContain(c);
    }
  });
  it('every Arcade action but capture and the unused swaps has a Player 2 key, and the key sets map the same bits', () => {
    const unbound = GAME_ACTIONS.filter((a: GameAction) => P2_BINDINGS[a].length === 0);
    expect(unbound).toEqual(['slot4', 'slot5', 'capture']);
    expect(commandFromHeld(P2_BINDINGS, new Set(['KeyI', 'KeyJ', 'KeyU', 'KeyY', 'KeyB']), true, true))
      .toBe(Cmd.up | Cmd.left | Cmd.primary | Cmd.dash | Cmd.super);
  });
  it('Player 1 keys do nothing for Player 2 and the other way round', () => {
    expect(commandFromHeld(P2_BINDINGS, new Set(['KeyW', 'Space', 'ArrowLeft', 'KeyX']), true, true)).toBe(0);
    expect(commandFromHeld(DEFAULT_BINDINGS, new Set(['KeyI', 'KeyU', 'KeyB']), true, true)).toBe(0);
  });
  it('two agents on one window each see only their own keys', () => {
    const view = {} as never;
    const mk = (bindings: typeof P2_BINDINGS) => new KeyboardAgent({ capturable: () => true, bindings, cheatsEnabled: false, arcade: true });
    const a = mk(DEFAULT_BINDINGS);
    const b = mk(P2_BINDINGS);
    const key = (code: string) => ({ type: 'down' as const, code, shiftKey: false, ctrlKey: false, repeat: false });
    for (const k of ['KeyD', 'KeyL']) { a.handle(key(k)); b.handle(key(k)); }
    expect(a.observe(view)).toBe(Cmd.right);
    expect(b.observe(view)).toBe(Cmd.right);
    a.handle(key('KeyU'));
    b.handle(key('Space'));
    expect(a.observe(view)).toBe(Cmd.right);
    expect(b.observe(view)).toBe(Cmd.right);
  });
  it('the hint lists both sets in words', () => {
    expect(controlsHint('Player 2', P2_BINDINGS)).toBe(
      'Player 2: I J K L move, U attack, O second attack, Y dash, N guard (hold), B super, T weather, G charge',
    );
    expect(controlsHint('Player 1', DEFAULT_BINDINGS)).toMatch(/^Player 1: W A S D move, /);
  });
});

describe('nthPad', () => {
  const pad = (n: number, connected = true): PadSnapshot => ({ connected, axes: [n], buttons: [] });
  it('picks the nth connected pad, skipping nulls and disconnected ones', () => {
    const pads = [null, pad(1), pad(9, false), pad(2)];
    expect(nthPad(pads, 0)?.axes[0]).toBe(1);
    expect(nthPad(pads, 1)?.axes[0]).toBe(2);
    expect(nthPad(pads, 2)).toBeNull();
    expect(nthPad(null, 0)).toBeNull();
  });
});
