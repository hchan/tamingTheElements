import { Cmd } from '@core/index';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PAD, PadButton, commandFromPad, firstPad, pauseEdge, stickCommand, type PadSnapshot } from './gamepad';

function pad(pressed: number[] = [], axes: number[] = [0, 0]): PadSnapshot {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
  return { connected: true, axes, buttons };
}

describe('stickCommand', () => {
  it('ignores the deadzone', () => {
    expect(stickCommand(0.2, -0.3, 0.4)).toBe(0);
  });
  it('maps the four directions and diagonals', () => {
    expect(stickCommand(-1, 0, 0.4)).toBe(Cmd.left);
    expect(stickCommand(1, 0, 0.4)).toBe(Cmd.right);
    expect(stickCommand(0, -1, 0.4)).toBe(Cmd.up);
    expect(stickCommand(0, 1, 0.4)).toBe(Cmd.down);
    expect(stickCommand(0.9, -0.9, 0.4)).toBe(Cmd.right | Cmd.up);
  });
});

describe('commandFromPad', () => {
  it('no pad, no command', () => {
    expect(commandFromPad(null, true)).toBe(0);
    expect(commandFromPad({ ...pad([PadButton.a]), connected: false }, true)).toBe(0);
  });
  it('A and B are the abilities', () => {
    expect(commandFromPad(pad([PadButton.a]), false)).toBe(Cmd.primary);
    expect(commandFromPad(pad([PadButton.a, PadButton.b]), false)).toBe(Cmd.primary | Cmd.secondary);
  });
  it('Y captures only when capturable', () => {
    expect(commandFromPad(pad([PadButton.y]), false)).toBe(0);
    expect(commandFromPad(pad([PadButton.y]), true)).toBe(Cmd.capture);
  });
  it('bumpers and triggers swap', () => {
    expect(commandFromPad(pad([PadButton.lb]), false)).toBe(Cmd.swap1);
    expect(commandFromPad(pad([PadButton.rb]), false)).toBe(Cmd.swap2);
    expect(commandFromPad(pad([PadButton.lt]), false)).toBe(Cmd.swap3);
    expect(commandFromPad(pad([PadButton.rt]), false)).toBe(Cmd.swap4);
  });
  it('d-pad and stick both move and combine', () => {
    expect(commandFromPad(pad([PadButton.dpadUp]), false)).toBe(Cmd.up);
    expect(commandFromPad(pad([PadButton.dpadLeft], [0.9, 0]), false)).toBe(Cmd.left | Cmd.right);
    expect(commandFromPad(pad([], [-1, 1]), false)).toBe(Cmd.left | Cmd.down);
  });
  it('analog triggers count past half travel', () => {
    const p = pad();
    const buttons = p.buttons.map((b, i) => (i === PadButton.rt ? { pressed: false, value: 0.7 } : b));
    expect(commandFromPad({ ...p, buttons }, false)).toBe(Cmd.swap4);
  });
  it('only emits declared command bits', () => {
    const all = Object.keys(DEFAULT_PAD.buttons).map(Number);
    const bits = commandFromPad(pad(all, [1, 1]), true);
    expect(bits & ~0x7ff).toBe(0);
  });
});

describe('pauseEdge', () => {
  it('fires once per press of Start', () => {
    const p = pad([PadButton.start]);
    const first = pauseEdge(false, p);
    expect(first).toEqual({ pressed: true, down: true });
    expect(pauseEdge(first.down, p)).toEqual({ pressed: false, down: true });
    expect(pauseEdge(true, pad())).toEqual({ pressed: false, down: false });
    expect(pauseEdge(false, null)).toEqual({ pressed: false, down: false });
  });
});

describe('firstPad', () => {
  it('skips nulls and disconnected pads', () => {
    const a = pad();
    expect(firstPad([null, { ...pad(), connected: false }, a])).toBe(a);
    expect(firstPad([null])).toBeNull();
    expect(firstPad(undefined)).toBeNull();
  });
});
