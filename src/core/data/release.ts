import { characterId, type CharacterId } from './ids';

/**
 * Roster-24 heroes released to players, one at a time (roster24-one-hero plan, WP-0). A hero is in this set only after its
 * art, kit, text and balance pass the release check; the legacy 14 are always released. Pilot (2026-11-23): zephra; vortigal joined 2026-11-24; all 12
 * appended heroes are now released (umbrel last, 2026-11-24), so `?ff=roster24` no longer hides anyone. Menu, picker, asset-build and balance-tool code reads it; the sim and the agents never do
 * (a test pins that), so a release cannot change a replay hash. Never reorder or re-add heroes: character indices are hashed.
 */
export const RELEASED_ROSTER24: ReadonlySet<CharacterId> = new Set<CharacterId>([characterId('zephra'), characterId('vortigal'), characterId('durrok'), characterId('glimmaw'), characterId('hyalia'), characterId('brazgor'), characterId('ouroth'), characterId('kindrel'), characterId('nykra'), characterId('abyssor'), characterId('quarrak'), characterId('umbrel')]);

/** True when `id` is a released appended (roster-24) hero. The legacy heroes are not in the set: they are released by being legacy. */
export function isReleased(id: CharacterId): boolean {
  return RELEASED_ROSTER24.has(id);
}
