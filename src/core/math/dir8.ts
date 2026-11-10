/**
 * Eight-way integer direction vectors. Index 0 = east, then counter-clockwise on screen
 * with y down meaning "up" is -1. Diagonals are (+-1,+-1): legacy fourway moves at full
 * speed on both axes, so they are deliberately not normalised.
 */
export const DIR8_X: readonly number[] = [1, 1, 0, -1, -1, -1, 0, 1];
export const DIR8_Y: readonly number[] = [0, -1, -1, -1, 0, 1, 1, 1];

/** Direction index for a sign pair, or -1 when both are zero. */
export function dir8FromSigns(sx: number, sy: number): number {
  const x = Math.sign(sx);
  const y = Math.sign(sy);
  for (let i = 0; i < 8; i++) {
    if (DIR8_X[i] === x && DIR8_Y[i] === y) return i;
  }
  return -1;
}
