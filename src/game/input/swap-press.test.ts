import { Cmd, type ObservationView } from '@core/index';
import { describe, expect, it } from 'vitest';
import type { PadSnapshot } from './gamepad';
import { type KeyInput } from './key-map';
import { KeyboardAgent, SWAP_RETRY_TICKS } from './keyboard-agent';

/** The Arcade swap press (FUN-DESIGN 2.6): one swap per press, latched to the next tick, retried while the clock is held. */
const view = {} as ObservationView;
const key = (type: KeyInput['type'], code: string, extra: Partial<KeyInput> = {}): KeyInput => ({
  type,
  code,
  shiftKey: false,
  ctrlKey: false,
  repeat: false,
  ...extra,
});
const swap = (c: number): number => c & Cmd.swap1;

function clocked(gamepad?: () => PadSnapshot | null) {
  let clock = 0;
  const noted: number[] = [];
  const agent = new KeyboardAgent({
    capturable: () => false,
    cheatsEnabled: false,
    arcade: true,
    clock: () => clock,
    onSwap: (b) => noted.push(b),
    gamepad,
  });
  return {
    agent,
    noted,
    tick: (): void => {
      clock++;
    },
  };
}

describe('KeyboardAgent swap press', () => {
  it('a held swap key sends one tick only, and key repeat does not chain another', () => {
    const { agent, tick } = clocked();
    agent.handle(key('down', 'Digit3'));
    expect(swap(agent.observe(view))).toBe(Cmd.swap1);
    tick();
    agent.handle(key('down', 'Digit3', { repeat: true }));
    expect(swap(agent.observe(view))).toBe(0);
    tick();
    expect(swap(agent.observe(view))).toBe(0);
  });

  it('a tap that starts and ends between observations is sent once and reported once', () => {
    const { agent, noted, tick } = clocked();
    agent.handle(key('down', 'Digit3'));
    agent.handle(key('up', 'Digit3'));
    expect(swap(agent.observe(view))).toBe(Cmd.swap1);
    tick();
    expect(swap(agent.observe(view))).toBe(0);
    expect(noted).toEqual([Cmd.swap1]);
  });

  it('is sent again while the game clock has not advanced (a retry is not a new press)', () => {
    const { agent, noted } = clocked();
    agent.handle(key('down', 'Digit3'));
    expect(swap(agent.observe(view))).toBe(Cmd.swap1);
    expect(swap(agent.observe(view))).toBe(Cmd.swap1);
    expect(noted).toEqual([Cmd.swap1]);
  });

  it('is not retried once the clock has advanced', () => {
    const { agent, tick } = clocked();
    agent.handle(key('down', 'Digit3'));
    agent.observe(view);
    tick();
    expect(swap(agent.observe(view))).toBe(0);
  });

  it('gives up retrying after SWAP_RETRY_TICKS', () => {
    const { agent } = clocked();
    agent.handle(key('down', 'Digit3'));
    let sent = 0;
    for (let i = 0; i < SWAP_RETRY_TICKS + 5; i++) if (swap(agent.observe(view))) sent++;
    expect(sent).toBe(SWAP_RETRY_TICKS + 1);
  });

  it('a pad press edge is latched from the frame poll and sent once', () => {
    let down = false;
    const pad = (): PadSnapshot => ({
      axes: [0, 0],
      buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 4 && down })),
    });
    const { agent, tick } = clocked(pad);
    down = true;
    agent.pollPad();
    down = false;
    agent.pollPad();
    expect(swap(agent.observe(view))).toBe(Cmd.swap1);
    tick();
    down = true;
    expect(swap(agent.observe(view))).toBe(Cmd.swap1);
    tick();
    expect(swap(agent.observe(view))).toBe(0);
  });

  it('a pointer press is one swap, and a blur clears a waiting one', () => {
    const { agent, tick } = clocked();
    agent.press(Cmd.swap1);
    expect(swap(agent.observe(view))).toBe(Cmd.swap1);
    tick();
    expect(swap(agent.observe(view))).toBe(0);
    agent.handle(key('down', 'Digit3'));
    agent.releaseAll();
    expect(swap(agent.observe(view))).toBe(0);
  });
});

describe('KeyboardAgent action press', () => {
  it('reports Super and Weather once per press, not while held', () => {
    const seen: number[] = [];
    const agent = new KeyboardAgent({ capturable: () => false, cheatsEnabled: false, arcade: true, onAction: (b) => seen.push(b) });
    agent.handle(key('down', 'Digit9'));
    agent.observe(view);
    agent.observe(view);
    agent.handle(key('up', 'Digit9'));
    agent.observe(view);
    agent.handle(key('down', 'Digit9'));
    agent.observe(view);
    agent.handle(key('down', 'Digit6'));
    agent.observe(view);
    expect(seen).toEqual([Cmd.super, Cmd.super, Cmd.weather]);
  });
});
