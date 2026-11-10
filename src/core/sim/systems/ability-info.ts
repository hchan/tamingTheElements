import { ABILITIES_A } from '../../data/abilities-a';
import { ABILITIES_B } from '../../data/abilities-b';
import { CHARACTERS } from '../../data/characters';
import { countIdx, type SimState } from '../state';

/**
 * Per-character ability bookkeeping (legacy `abilitiesInfo`, deep-copied into every character): the slot an ability
 * occupies on a character and its active count. Cooldowns and counts live in `SimState.abil` (see `cooldownIdx` and
 * `countIdx` in state.ts).
 */

const DEFS = [...ABILITIES_A, ...ABILITIES_B];
const CAPTURE_IDX = DEFS.findIndex((d) => d.id === 'capture');

/** Capture sits after the character's own ability slots (legacy appends it to the player's abilitiesInfo). */
export const CAPTURE_SLOT = 2;

/**
 * Slot of ability `defIdx` (index into abilities A then B) on character `id`, or -1 when the character has no such
 * ability (legacy `abilitiesInfo[name]` is undefined). Capture is slot 2 on the player side only.
 */
export function abilitySlot(s: SimState, id: number, defIdx: number): number {
  if (defIdx === CAPTURE_IDX) return s.team[id] === 0 ? CAPTURE_SLOT : -1;
  const abilityId = DEFS[defIdx]?.id;
  if (abilityId === undefined) return -1;
  return CHARACTERS[s.defId[id] ?? 0]?.abilities.indexOf(abilityId) ?? -1;
}

/**
 * Legacy `removeBullet` / `removeMelee`: decrements `holder`'s active count for the ability. When the holder has no
 * such ability the legacy decrement throws inside a try/catch and nothing changes.
 */
export function releaseCount(s: SimState, holder: number, defIdx: number): void {
  const slot = abilitySlot(s, holder, defIdx);
  if (slot < 0) return;
  const i = countIdx(holder, slot);
  s.abil[i] = (s.abil[i] ?? 0) - 1;
}
