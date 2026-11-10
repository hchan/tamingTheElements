import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_FLAGS, decodeFlags, encodeFlags } from './flags';

describe('sim flags', () => {
  it('are all off by default', () => {
    expect(Object.values(DEFAULT_SIM_FLAGS).every((v) => v === false)).toBe(true);
    expect(encodeFlags(DEFAULT_SIM_FLAGS)).toBe('');
  });

  it('encodes sorted and round-trips', () => {
    const f = { ...DEFAULT_SIM_FLAGS, experimentalSpawnCurve: true, experimentalPathing: true };
    expect(encodeFlags(f)).toBe('experimentalPathing,experimentalSpawnCurve');
    expect(decodeFlags(encodeFlags(f))).toEqual(f);
    expect(decodeFlags('')).toEqual(DEFAULT_SIM_FLAGS);
  });

  it('rejects unknown flags', () => {
    expect(() => decodeFlags('nope')).toThrow(/unknown sim flag/);
  });
});
