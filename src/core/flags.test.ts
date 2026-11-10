import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIM_FLAGS,
  FLAG_NAMES,
  decodeFlags,
  encodeFlags,
  flagBit,
  flagBits,
  flagsFromBits,
} from './flags';

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

  it('keeps every older flag on its bit: rulesetArcade sorts after them, tester-only testerCapture after that (FUN-DESIGN section 6)', () => {
    expect(FLAG_NAMES).toEqual([
      'elementalAdvantage',
      'experimentalPathing',
      'experimentalSpawnCurve',
      'rulesetArcade',
      'testerCapture',
      'walkAboveActionBar',
    ]);
    expect(flagBit('walkAboveActionBar')).toBe(32);
    expect(flagBit('elementalAdvantage')).toBe(1);
    expect(flagBit('experimentalPathing')).toBe(2);
    expect(flagBit('experimentalSpawnCurve')).toBe(4);
    expect(flagBit('rulesetArcade')).toBe(8);
    expect(flagBit('testerCapture')).toBe(16);
  });

  it('encodes rulesetArcade in the replay header and flagsFromBits inverts flagBits', () => {
    const f = { ...DEFAULT_SIM_FLAGS, elementalAdvantage: true, rulesetArcade: true };
    expect(encodeFlags(f)).toBe('elementalAdvantage,rulesetArcade');
    expect(decodeFlags(encodeFlags(f))).toEqual(f);
    for (let bits = 0; bits < 1 << FLAG_NAMES.length; bits++) {
      expect(flagBits(flagsFromBits(bits))).toBe(bits);
      expect(flagBits(flagsFromBits(bits | (1 << 16)))).toBe(bits);
    }
  });
});
