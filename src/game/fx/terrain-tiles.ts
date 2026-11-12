import { seedSfc32 } from '@core/index';

/**
 * The Arcade arena floor as a tile index grid (WP-tile-floor, view only). Pure: (stage, match seed, size) in, indices out,
 * from the dedicated sfc32 stream `tilefloor.<element>`, so a match looks the same on every engine and a rematch with the
 * same seed gets the same floor. Mostly plain floor, sparse decoration; the grid is point-symmetric about its centre (like
 * the patch layout), so neither side is favoured. Indices are the atlas columns of `public/assets/img/tilefloor.png`
 * (0-3 plain floor, 4-7 decoration; tools/assets/tile-gen/tilefloor.py); the view adds the stage's row.
 */

/** Atlas columns per stage row, tile size in px and the atlas's texture key and URL (relative to `<base>assets/`). */
export const TILE_COLUMNS = 8;
export const TILE_SIZE = 32;
export const TILE_TEXTURE = 'tilefloor';
export const TILE_URL = 'img/tilefloor.png';

/** Pick weights per column, in percent: plain variants 0-3 (92) and the four decorations (2 each). */
export const TILE_WEIGHTS = [46, 24, 14, 8, 2, 2, 2, 2] as const;
const TOTAL_WEIGHT = TILE_WEIGHTS.reduce((a, b) => a + b, 0);

/** Stage kinds are the sim's weather kinds: 1 fire, 2 water, 3 earth, 4 air. */
const ELEMENTS = ['fire', 'water', 'earth', 'air'] as const;

/** The `cols` x `rows` grid for `stage` (1..4), row-major, each index in 0..TILE_COLUMNS-1. */
export function tileGrid(stage: number, seed: number, cols: number, rows: number): number[] {
  const n = cols * rows;
  const out = new Array<number>(n).fill(0);
  const rng = seedSfc32(seed >>> 0, `tilefloor.${ELEMENTS[stage - 1] ?? 'none'}`);
  const half = Math.ceil(n / 2);
  for (let i = 0; i < half; i++) {
    let r = rng.int(TOTAL_WEIGHT);
    let k = 0;
    while (k < TILE_COLUMNS - 1 && r >= (TILE_WEIGHTS[k] ?? 0)) r -= TILE_WEIGHTS[k++] ?? 0;
    out[i] = k;
    out[n - 1 - i] = k;
  }
  return out;
}
