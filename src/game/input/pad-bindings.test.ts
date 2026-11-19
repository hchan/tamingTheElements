import { afterEach, describe, expect, it } from 'vitest';
import { Cmd } from '@core/index';
import { ARCADE_PAD, DEFAULT_PAD, commandFromPad, padButtonsFor, padConfigFor, pauseEdge, type PadSnapshot } from './gamepad';
import {
  PAD_BINDINGS_KEY,
  PAD_ROWS,
  padBind,
  padButtonFor,
  padButtonLabel,
  parsePadOverrides,
  readPadOverrides,
  setPadOverrides,
  writePadOverrides,
} from '../platform/input/pad-bindings';

afterEach(() => {
  setPadOverrides({});
});

describe('pad Run (gamepad-run idea)', () => {
  it('Home sends Cmd.run in the partner game only, and a run row moves it', () => {
    const held = { axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 16 })) };
    expect(commandFromPad(held, true, ARCADE_PAD) & Cmd.run).toBe(Cmd.run);
    expect(commandFromPad(held, true, DEFAULT_PAD) & Cmd.run).toBe(0);
    const o = padBind({}, 'run', 17).overrides;
    expect(padButtonsFor(o, true)[17]).toBe(Cmd.run);
    expect(padButtonsFor(o, true)[16]).toBeUndefined();
  });
});

const pad = (down: number[]): PadSnapshot => ({
  axes: [0, 0],
  buttons: Array.from({ length: 20 }, (_, i) => ({ pressed: down.includes(i) })),
});

describe('pad rows', () => {
  it('give back exactly the shipped default tables with no overrides', () => {
    expect(padButtonsFor({}, false)).toEqual(DEFAULT_PAD.buttons);
    expect(padButtonsFor({}, true)).toEqual(ARCADE_PAD.buttons);
    expect(padButtonFor({}, 'pause')).toBe(DEFAULT_PAD.pauseButton);
  });

  it('start on distinct buttons', () => {
    expect(new Set(PAD_ROWS.map((r) => r.def)).size).toBe(PAD_ROWS.length);
  });

  it('name buttons in words', () => {
    expect(padButtonLabel(0)).toBe('A');
    expect(padButtonLabel(9)).toBe('Start');
    expect(padButtonLabel(20)).toBe('Button 20');
  });
});

describe('padBind', () => {
  it('moves an action to a free button and drops the entry when it returns to the default', () => {
    const r = padBind({}, 'primary', 18);
    expect(r.overrides).toEqual({ primary: 18 });
    expect(r.swappedWith).toBeUndefined();
    expect(padBind(r.overrides, 'primary', 0).overrides).toEqual({});
  });

  it('swaps with the owner of a used button', () => {
    const r = padBind({}, 'primary', 1);
    expect(r.swappedWith).toBe('Secondary Ability');
    expect(padButtonFor(r.overrides, 'primary')).toBe(1);
    expect(padButtonFor(r.overrides, 'secondary')).toBe(0);
  });

  it('binding to the current button changes nothing', () => {
    expect(padBind({ primary: 18 }, 'primary', 18).overrides).toEqual({ primary: 18 });
  });
});

describe('parsePadOverrides', () => {
  it('keeps a stored swap', () => {
    const o = padBind({}, 'primary', 1).overrides;
    expect(parsePadOverrides(JSON.parse(JSON.stringify(o)))).toEqual(o);
  });

  it('drops junk, unknown rows and out-of-range values', () => {
    expect(parsePadOverrides({ primary: 'x', nope: 3, up: 99, down: 1.5, left: -1 })).toEqual({});
    expect(parsePadOverrides(null)).toEqual({});
    expect(parsePadOverrides([1])).toEqual({});
  });

  it('discards a map that puts two actions on one button', () => {
    expect(parsePadOverrides({ primary: 18, secondary: 18 })).toEqual({});
  });
});

describe('storage', () => {
  it('round-trips through a store and tolerates a broken one', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    writePadOverrides({ primary: 18 }, store);
    expect(mem.has(PAD_BINDINGS_KEY)).toBe(true);
    expect(readPadOverrides(store)).toEqual({ primary: 18 });
    mem.set(PAD_BINDINGS_KEY, '{not json');
    expect(readPadOverrides(store)).toEqual({});
    expect(readPadOverrides(undefined)).toEqual({});
  });
});

describe('padConfigFor', () => {
  it('is the shipped config until something is rebound', () => {
    expect(padConfigFor(false)).toBe(DEFAULT_PAD);
    expect(padConfigFor(true)).toBe(ARCADE_PAD);
  });

  it('makes the rebound button send the command, in both game kinds, and keeps Trap ungated', () => {
    setPadOverrides(padBind({}, 'primary', 18).overrides);
    expect(commandFromPad(pad([18]), true, padConfigFor(false))).toBe(Cmd.primary);
    expect(commandFromPad(pad([0]), true, padConfigFor(false))).toBe(0);
    expect(commandFromPad(pad([18]), true, padConfigFor(true))).toBe(Cmd.primary);
    expect(commandFromPad(pad([3]), false, padConfigFor(true))).toBe(Cmd.trap);
    expect(commandFromPad(pad([3]), false, padConfigFor(false))).toBe(0);
  });

  it('moves the pause button', () => {
    setPadOverrides(padBind({}, 'pause', 18).overrides);
    expect(pauseEdge(false, pad([18]), padConfigFor(false)).pressed).toBe(true);
    expect(pauseEdge(false, pad([9]), padConfigFor(false)).pressed).toBe(false);
  });
});
