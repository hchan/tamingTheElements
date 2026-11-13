/**
 * Where the player's Tag box sits on the (centred) Arcade action bar: the bar view publishes the box's top-centre each frame, the tag
 * view's "TAG" caption in the Arena reads it. Tiny and dependency-free so both can import it without pulling each other into a chunk.
 */
export interface TagSlotPos {
  x: number;
  y: number;
}

/** Default: the third box of a left-aligned bar (as before the bar was centred). */
export const tagSlot: TagSlotPos = { x: 1 + 2 * 77 + 77 / 2, y: 640 };
