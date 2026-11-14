import type Phaser from 'phaser';
import { arcadePlayfield } from '@core/index';
import { PAINT_TEXTURE, PAINT_URL, WALL_Y } from './terrain-stage-layout';
import { TILE_COLUMNS, TILE_SIZE, TILE_TEXTURE, TILE_URL, tileGrid } from './terrain-tiles';

/**
 * The arena floor of the Arcade terrain view (WP-tile-floor, painted 2026-11-13, view only), under the patches, in two layers:
 * - a painted floor per stage (`arenafloor.png`, tools/assets/stage-gen/arena-floor.py): one continuous 1920 x 536 image from
 *   the wall down, with perspective, a pool of light where the fight is and the stage's own large-scale detail;
 * - over it, one Phaser tilemap layer of sparse feathered details (`tilefloor.png`, mostly transparent tiles): the grid of
 *   `tileGrid(stage, seed, ...)`, so each match scatters them differently.
 * Both atlases load lazily (so only the terrain-view chunk's matches request them); the layer is built once per stage and
 * re-filled when the stage swaps, the painted image only changes frame. After that a frame only sets alphas: nothing
 * allocates per frame. Static art, so reduced motion needs no change (the caller's fade alpha is already 1 then).
 */

const COLS = Math.ceil(arcadePlayfield().w / TILE_SIZE);
const ROWS = Math.ceil(720 / TILE_SIZE);
/** The grid is centred on the arena (its overhang is cropped equally top and bottom), so its point symmetry is the arena's. */
const ORIGIN_Y = (720 - ROWS * TILE_SIZE) / 2;
/** The top rows are left out: the stage backdrop (terrain-stage.ts) shows there, above the wall at WALL_Y. */
const BAND_ROWS = Math.round((WALL_Y - ORIGIN_Y) / TILE_SIZE);
/** Opaque: the painted floor carries its own light, so no backdrop bleed-through is needed. */
const FLOOR_ALPHA = 1;
export { PAINT_TEXTURE };
/** One painted floor per stage, stacked in stage order: from the wall to the bottom of the arena. */
const PAINT_H = 720 - WALL_Y;
const paintFrame = (stage: number): string => `floor${String(stage)}`;

export interface TileFloor {
  /** Draws the floor of `stage` (0 none) at `alpha`; builds it the first frame the atlas is loaded. */
  update(stage: number, alpha: number): void;
  /** The stage whose tiles are on the layer (0 before the atlas loads; test probe). */
  readonly stage: number;
  destroy(): void;
}

/** `base` is Vite's BASE_URL; `seed` the match seed. */
export function mountTileFloor(scene: Phaser.Scene, base: string, seed: number, depth: number): TileFloor {
  let layer: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer | undefined;
  let map: Phaser.Tilemaps.Tilemap | undefined;
  let paint: Phaser.GameObjects.Image | undefined;
  let painted = 0;
  let built = 0;
  const root = `${base.endsWith('/') ? base : `${base}/`}assets/`;
  const atlases: readonly (readonly [string, string])[] = [[TILE_TEXTURE, TILE_URL], [PAINT_TEXTURE, PAINT_URL]];
  const missing = atlases.filter(([k]) => !scene.textures.exists(k));
  for (const [k, url] of missing) scene.load.image(k, `${root}${url}`);
  if (missing.length > 0) scene.load.start();

  const rows = (stage: number): number[][] => {
    const grid = tileGrid(stage, seed, COLS, ROWS);
    const first = (stage - 1) * TILE_COLUMNS;
    return Array.from({ length: ROWS - BAND_ROWS }, (_, y) => grid.slice((y + BAND_ROWS) * COLS, (y + BAND_ROWS + 1) * COLS).map((k) => first + k));
  };

  const build = (stage: number): void => {
    if (!layer) {
      map = scene.make.tilemap({ data: rows(stage), tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
      const tileset = map.addTilesetImage(TILE_TEXTURE, TILE_TEXTURE, TILE_SIZE, TILE_SIZE, 0, 0, 0);
      layer = (tileset && map.createLayer(0, tileset, 0, ORIGIN_Y + BAND_ROWS * TILE_SIZE)) || undefined;
      layer?.setDepth(depth);
    } else layer.putTilesAt(rows(stage), 0, 0);
    built = stage;
  };

  const buildPaint = (): void => {
    const tex = scene.textures.get(PAINT_TEXTURE);
    for (let k = 1; k <= 4; k++) if (!tex.has(paintFrame(k))) tex.add(paintFrame(k), 0, 0, (k - 1) * PAINT_H, arcadePlayfield().w, PAINT_H);
    paint = scene.add.image(0, WALL_Y, PAINT_TEXTURE, paintFrame(1)).setOrigin(0, 0).setDepth(depth - 0.005);
    painted = 1;
  };

  return {
    update(stage, alpha): void {
      if (stage > 0 && stage !== built && scene.textures.exists(TILE_TEXTURE)) build(stage);
      if (stage > 0 && !paint && scene.textures.exists(PAINT_TEXTURE)) buildPaint();
      layer?.setAlpha(alpha * FLOOR_ALPHA).setVisible(stage > 0);
      if (paint && stage > 0 && stage !== painted) {
        paint.setFrame(paintFrame(stage));
        painted = stage;
      }
      paint?.setAlpha(alpha * FLOOR_ALPHA).setVisible(stage > 0);
    },
    get stage(): number {
      return built;
    },
    destroy(): void {
      layer?.destroy();
      map?.destroy();
      paint?.destroy();
      paint = undefined;
      layer = undefined;
      map = undefined;
    },
  };
}
