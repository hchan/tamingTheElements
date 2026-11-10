// Sprite sheet spec (FUN-DESIGN section 2.16 step 2). Pure data and functions, no I/O: shared by the packer, the tests and (later) the view.
// One sheet per character: 80x80 frames, one row per action x 8 directions, up to SHEET_COLS frames per row. Any row without art falls
// back to the legacy walk strips (see `legacyFallback`), so the pipeline works with zero new art.
import manifest from '../../src/game/assets/manifest.generated.json' with { type: 'json' };

export const FRAME = 80;
/** Directions in row order, clockwise from east. */
export const DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'] as const;
export type Dir = (typeof DIRS)[number];
/** Actions in row-block order, with the frame count of each row. */
export const ACTIONS = [
  ['idle', 4],
  ['walk', 4],
  ['cast', 4],
  ['hurt', 2],
  ['guard', 2],
  ['dash', 3],
  ['ko', 4],
  ['victory', 4],
  ['tagIn', 4],
] as const;
export type Action = (typeof ACTIONS)[number][0];
export const SHEET_COLS = 4;
export const SHEET_W = FRAME * SHEET_COLS;
export const SHEET_H = FRAME * ACTIONS.length * DIRS.length;
/** Where per-frame PNGs live: `<SOURCE_DIR>/<sprite>/<action>/<dir>/<NN>.png` (NN = 00-based, zero padded) plus `<sprite>/license.txt`. */
export const SOURCE_DIR = 'imgWorkArea/sheets';
/** Output sheets: `public/assets/img/sheets/<sprite>.png`. */
export const OUT_DIR = 'public/assets/img/sheets';

export const rowKey = (a: Action, d: Dir): string => `${a}/${d}`;
export const framesIn = (a: Action): number => ACTIONS.find(([n]) => n === a)?.[1] ?? 0;
/** Row index (0-based) of an action and direction in the sheet. */
export function rowIndex(a: Action, d: Dir): number {
  const ai = ACTIONS.findIndex(([n]) => n === a);
  if (ai < 0) throw new Error(`unknown action ${a}`);
  return ai * DIRS.length + DIRS.indexOf(d);
}
export interface RowSpec {
  readonly action: Action;
  readonly dir: Dir;
  readonly key: string;
  readonly index: number;
  readonly frames: number;
}
export const ALL_ROWS: readonly RowSpec[] = ACTIONS.flatMap(([action, frames]) =>
  DIRS.map((dir) => ({ action, dir, key: rowKey(action, dir), index: rowIndex(action, dir), frames })),
);

/** Characters that get a sheet: the 80x80 legacy map sprites (not the Large variants, the Up/Down strips or the 400px Pria). */
export function sheetCharacters(): string[] {
  return Object.entries(manifest.mapSprites)
    .filter(([k, v]) => v.coords[2] === FRAME && !k.endsWith('Large') && !/(Up|Down)$/.test(k))
    .map(([k]) => k)
    .sort();
}

export interface LegacyFallback {
  /** Which legacy frame set to play; the view mirrors `left` from `right` exactly as today. */
  readonly set: 'right' | 'left' | 'up' | 'down';
  /** `strip` plays the whole walk strip; every other action holds frame 0 and leaves the motion to the procedural pose layer (WP 33). */
  readonly frames: 'strip' | 'first';
}

/** Legacy art for a missing row: side sets for E/W and the diagonals (nearest side), up/down where the legacy sprite has them. */
export function legacyFallback(sprite: string, action: Action, dir: Dir): LegacyFallback {
  const m = (manifest.mapSprites as Record<string, { upFrames?: unknown; downFrames?: unknown } | undefined>)[sprite];
  if (!m) throw new Error(`unknown legacy sprite ${sprite}`);
  const hasUp = m.upFrames !== undefined || `${sprite}Up` in manifest.mapSprites;
  const hasDown = m.downFrames !== undefined || `${sprite}Down` in manifest.mapSprites;
  const set: LegacyFallback['set'] =
    dir === 'N' && hasUp ? 'up' : dir === 'S' && hasDown ? 'down' : dir === 'W' || dir === 'SW' || dir === 'NW' ? 'left' : 'right';
  return { set, frames: action === 'walk' ? 'strip' : 'first' };
}
