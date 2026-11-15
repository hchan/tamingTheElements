import { CcKind } from '../../../data/arcade';
import { flagBit } from '../../../flags';
import { isArcade } from '../../clock';
import { STATUS_SLOTS, World as W, type SimState } from '../../state';
import { StatusId, StatusField, statusBase, statusSlot } from '../status';

/**
 * Crowd-control read-outs (flag withCrowdControl, systems/arcade/cc.ts). A leaf: it imports only state, status, clock and
 * flags, so stun.ts can gate on it without a cycle. Every read is false or 0 unless the flag is set in an Arcade match.
 */
const CC_BIT = flagBit('withCrowdControl');

/** True when the match runs Arcade with `withCrowdControl` set. Reads the hashed world flag bits, never a module variable. */
export function ccOn(s: SimState): boolean {
  return isArcade(s) && ((s.world[W.flags] ?? 0) & CC_BIT) !== 0;
}

/** The hard CC (daze, iced, downed) holding `id` as a CcKind, else CcKind.none. Non-allocating. */
export function heldKind(s: SimState, id: number): number {
  if (!ccOn(s)) return CcKind.none;
  for (let slot = 0; slot < STATUS_SLOTS; slot++) {
    const sid = s.status[statusBase(id, slot) + StatusField.id] ?? 0;
    if (sid === StatusId.dazed) return CcKind.daze;
    if (sid === StatusId.iced) return CcKind.iced;
    if (sid === StatusId.downed) return CcKind.downed;
  }
  return CcKind.none;
}

/** True while a hard CC (daze, iced, downed) holds `id`: it cannot act. */
export function ccHeld(s: SimState, id: number): boolean {
  return heldKind(s, id) !== CcKind.none;
}

/** True while `id` is silenced: no hero abilities, elemental, super or weather. */
export function isSilenced(s: SimState, id: number): boolean {
  return ccOn(s) && statusSlot(s, id, StatusId.silenced) >= 0;
}

/** Diminishing-returns level (0 full, 1 half, 2 immune) of `bucket` (a CcBucket) on `id`, from its hidden ward. */
export function ccLevel(s: SimState, id: number, bucket: number): number {
  if (!ccOn(s)) return 0;
  const slot = statusSlot(s, id, StatusId.ccWard);
  if (slot < 0) return 0;
  return ((s.status[statusBase(id, slot) + StatusField.mag] ?? 0) >> (bucket * 2)) & 3;
}

/** True while `id` is chilled: an Ice Blast or tidal slow status, or a Puddle slow (read by the Iced rule). */
export function isChilled(s: SimState, id: number, puddleUntil: number, g: number): boolean {
  return statusSlot(s, id, StatusId.iceBlast) >= 0 || statusSlot(s, id, StatusId.superSlow) >= 0 || puddleUntil > g;
}
