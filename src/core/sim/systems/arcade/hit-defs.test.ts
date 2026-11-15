import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../../data/characters';
import { MAX_ABILITY_DEFS } from '../../state';
import { ABILITY_DEFS } from '../melee';
import { CHARGE_DEF, HIT_STRENGTH, HIT_STUN, SUPER_DEF, TRAP_BOMB_DEF, TRAP_SPIKE_DEF } from './hit';

/** Roster plan WP 0.1 (SIM_VERSION 68): the special hit defs are pinned constants, out of the ability index range. */
describe('special hit defs', () => {
  const SPECIAL = [SUPER_DEF, CHARGE_DEF, TRAP_BOMB_DEF, TRAP_SPIKE_DEF];

  it('are pinned at 0x100..0x103 (SUPER_DEF is hashed: changing these is a sim change)', () => {
    expect(SPECIAL).toEqual([0x100, 0x101, 0x102, 0x103]);
  });

  it('lie outside every ability index and every per-ability table', () => {
    expect(new Set(SPECIAL).size).toBe(SPECIAL.length);
    for (const d of SPECIAL) {
      expect(d).toBeGreaterThanOrEqual(MAX_ABILITY_DEFS);
      expect(ABILITY_DEFS[d]).toBeUndefined();
      expect(HIT_STRENGTH[d]).toBeUndefined();
      expect(HIT_STUN[d]).toBeUndefined();
      expect(CHARACTERS[d]).toBeUndefined();
    }
    expect(HIT_STRENGTH).toHaveLength(ABILITY_DEFS.length);
    expect(HIT_STUN).toHaveLength(ABILITY_DEFS.length);
  });
});
