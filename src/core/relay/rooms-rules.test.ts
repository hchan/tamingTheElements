import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  generateRoomCode,
  isRoomCode,
  MAX_ROOMS,
  normalizeRoomCode,
  ROOM_TTL_MS,
} from './rooms-rules';

describe('rooms-rules', () => {
  it('keeps the legacy constants', () => {
    expect(ROOM_TTL_MS).toBe(600_000);
    expect(MAX_ROOMS).toBe(2000);
    expect(CODE_LENGTH).toBe(6);
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(CODE_ALPHABET).not.toMatch(/[01OI]/);
  });
  it('generates valid codes from the injected randomness', () => {
    let i = 0;
    const code = generateRoomCode((n) => i++ % n);
    expect(code).toBe('ABCDEF');
    expect(isRoomCode(code)).toBe(true);
  });
  it('normalises and validates', () => {
    expect(normalizeRoomCode('  abc234 ')).toBe('ABC234');
    expect(isRoomCode('ABC23')).toBe(false);
    expect(isRoomCode('ABC230')).toBe(false);
  });
});
