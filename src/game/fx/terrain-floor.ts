import type Phaser from 'phaser';
import { arcadePlayfield } from '@core/index';
import { TILE_COLUMNS, TILE_SIZE, TILE_TEXTURE, TILE_URL, tileGrid } from './terrain-tiles';

/**
 * The tiled arena floor of the Arcade terrain view (WP-tile-floor, view only). One Phaser tilemap layer over the backdrop,
 * under the patches: it loads the small atlas lazily (so only the terrain-view chunk's matches request it), builds the grid
 * of `tileGrid(stage, seed, ...)` once per stage and re-fills the same layer when the stage swaps. After that a frame only
 * sets the layer's alpha: nothing allocates per frame. Static art, so reduced motion needs no change (the caller's fade
 * alpha is already 1 then).
 */

const COLS = Math.ceil(arcadePlayfield().w / TILE_SIZE);
const ROWS = Math.ceil(720 / TILE_SIZE);
/** The grid is centred on the arena (its overhang is cropped equally top and bottom), so its point symmetry is the arena's. */
const ORIGIN_Y = (720 - ROWS * TILE_SIZE) / 2;
/** A little of the stage backdrop shows through, so the floor sits in the scene instead of covering it. */
const FLOOR_ALPHA = 0.9;

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
  let built = 0;
  if (!scene.textures.exists(TILE_TEXTURE)) {
    scene.load.image(TILE_TEXTURE, `${base.endsWith('/') ? base : `${base}/`}assets/${TILE_URL}`);
    scene.load.start();
  }

  const rows = (stage: number): number[][] => {
    const grid = tileGrid(stage, seed, COLS, ROWS);
    const first = (stage - 1) * TILE_COLUMNS;
    return Array.from({ length: ROWS }, (_, y) => grid.slice(y * COLS, (y + 1) * COLS).map((k) => first + k));
  };

  const build = (stage: number): void => {
    if (!layer) {
      map = scene.make.tilemap({ data: rows(stage), tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
      const tileset = map.addTilesetImage(TILE_TEXTURE, TILE_TEXTURE, TILE_SIZE, TILE_SIZE, 0, 0, 0);
      layer = (tileset && map.createLayer(0, tileset, 0, ORIGIN_Y)) || undefined;
      layer?.setDepth(depth);
    } else layer.putTilesAt(rows(stage), 0, 0);
    built = stage;
  };

  return {
    update(stage, alpha): void {
      if (stage > 0 && stage !== built && scene.textures.exists(TILE_TEXTURE)) build(stage);
      layer?.setAlpha(alpha * FLOOR_ALPHA).setVisible(stage > 0);
    },
    get stage(): number {
      return built;
    },
    destroy(): void {
      layer?.destroy();
      map?.destroy();
      layer = undefined;
      map = undefined;
    },
  };
}
