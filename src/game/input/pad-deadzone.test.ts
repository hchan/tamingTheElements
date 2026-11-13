import { afterEach, describe, expect, it } from 'vitest';
import { Cmd } from '@core/index';
import { DEFAULT_PAD, commandFromPad, padConfigFor } from './gamepad';
import {
  PAD_DEADZONE_DEFAULT,
  PAD_DEADZONE_KEY,
  clampDeadzone,
  readPadDeadzone,
  setPadDeadzone,
  writePadDeadzone,
} from '../platform/input/pad-bindings';

afterEach(() => {
  setPadDeadzone(PAD_DEADZONE_DEFAULT);
});

const store = (v?: string): Pick<Storage, 'getItem' | 'setItem'> => {
  let got: string | null = v ?? null;
  return {
    getItem: () => got,
    setItem: (_k: string, val: string) => {
      got = val;
    },
  };
};

describe('stick deadzone option', () => {
  it('the default matches the shipped pad', () => {
    expect(PAD_DEADZONE_DEFAULT).toBe(DEFAULT_PAD.deadzone);
    expect(padConfigFor(false)).toBe(DEFAULT_PAD);
  });

  it('clamps and sanitises', () => {
    expect(clampDeadzone(0)).toBe(0.1);
    expect(clampDeadzone(5)).toBe(0.8);
    expect(clampDeadzone(0.333)).toBe(0.33);
    expect(clampDeadzone('x')).toBe(0.4);
    expect(clampDeadzone(NaN)).toBe(0.4);
  });

  it('round-trips through the store and survives junk', () => {
    const s = store();
    writePadDeadzone(0.25, s);
    expect(readPadDeadzone(s)).toBe(0.25);
    expect(readPadDeadzone(store('not json'))).toBe(0.4);
    expect(readPadDeadzone(store('99'))).toBe(0.8);
    expect(PAD_DEADZONE_KEY).toBe('tte.padDeadzone');
  });

  it('changes which stick pushes count, for both game kinds', () => {
    const p = { axes: [0.3, 0], buttons: [] };
    expect(commandFromPad(p, true, padConfigFor(false))).toBe(0);
    setPadDeadzone(0.2);
    expect(commandFromPad(p, true, padConfigFor(false))).toBe(Cmd.right);
    expect(commandFromPad(p, true, padConfigFor(true))).toBe(Cmd.right);
    setPadDeadzone(0.6);
    expect(commandFromPad({ axes: [0.5, 0], buttons: [] }, true, padConfigFor(true))).toBe(0);
  });
});
