import { describe, expect, it } from 'vitest';
import { LEGACY_CHARACTERS } from '../../src/core/data/characters';

/** Guard for ideas/done/pax-speed-10-vs-5.md: legacy data and docs give Pax speed 5 (the old value of 10 was wrong). */
describe('Pax speed', () => {
  it('is 5, matching the legacy character data', () => {
    const pax = LEGACY_CHARACTERS.find((c) => c.id === 'pax');
    expect(pax?.speed).toBe(5);
  });
});
