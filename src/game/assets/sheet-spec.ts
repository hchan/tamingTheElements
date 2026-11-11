// Sprite sheet spec (FUN-DESIGN section 2.16 step 2). Pure data and functions, no I/O: shared by the packer (tools/assets), the tests and
// (later) the view. One compact atlas per character: 80x80 frames, only the rows that have art, packed in shelves and wrapped so the
// atlas is never wider or taller than ATLAS_MAX (phone GPUs often cap textures at 4096; 2048 is safe everywhere).
//
// Fallback order for a (sprite, action, dir), see `resolveRow`:
//   1. the sprite's own row for that direction;
//   2. the mirrored east-side row (W from E, NW from NE, SW from SE), drawn flipped horizontally;
//   3. legacy art (`legacyFallback`), exactly as today.
import manifest from './manifest.generated.json' with { type: 'json' };

export const FRAME = 80;
/** Largest atlas side in pixels (width and height). */
export const ATLAS_MAX = 2048;
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
/** Where per-frame PNGs live: `<SOURCE_DIR>/<sprite>/<action>/<dir>/<NN>.png` (NN = 00-based, zero padded) plus `<sprite>/license.txt`. */
export const SOURCE_DIR = 'imgWorkArea/sheets';
/** Output atlases: `public/assets/img/sheets/<sprite>.png`. */
export const OUT_DIR = 'public/assets/img/sheets';
/** Weight budget per atlas file (also enforced, with the total, by tools/ci/size-budget.json). */
export const SHEET_MAX_BYTES = 600 * 1024;

export const rowKey = (a: Action, d: Dir): string => `${a}/${d}`;
export const framesIn = (a: Action): number => ACTIONS.find(([n]) => n === a)?.[1] ?? 0;
/** Canonical row order (action block, then direction); the packer sorts by this so output is deterministic. */
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

// ---- atlas layout ----

export interface Placement {
  readonly key: string;
  readonly x: number;
  readonly y: number;
}
export interface Layout {
  readonly width: number;
  readonly height: number;
  readonly placements: readonly Placement[];
}

/**
 * Shelf layout: rows in the given order, left to right, each `frames * FRAME` wide and FRAME tall; a row that would pass `max` starts
 * a new shelf. Width is the widest shelf, height the shelf count. Pure and deterministic. Throws if a row is wider than `max` or the
 * shelves would be taller than `max`.
 */
export function layoutAtlas(rows: readonly { readonly key: string; readonly frames: number }[], max = ATLAS_MAX): Layout {
  const placements: Placement[] = [];
  let x = 0;
  let y = 0;
  let width = 0;
  for (const r of rows) {
    const w = r.frames * FRAME;
    if (w > max) throw new Error(`row ${r.key} is ${String(w)} px wide, atlas limit ${String(max)}`);
    if (x + w > max) {
      x = 0;
      y += FRAME;
    }
    if (y + FRAME > max) throw new Error(`atlas needs more than ${String(max)} px of height (row ${r.key})`);
    placements.push({ key: r.key, x, y });
    x += w;
    width = Math.max(width, x);
  }
  return { width, height: placements.length === 0 ? 0 : y + FRAME, placements };
}

// ---- manifest types and lookup ----

export interface SheetRow {
  /** `action/dir`. */
  readonly key: string;
  /** Top-left corner of each frame (FRAME x FRAME), in playing order. */
  readonly frames: readonly (readonly [number, number])[];
}
export interface SheetEntry {
  readonly sprite: string;
  /** The fields below are present only when at least one row has art. */
  readonly url?: string;
  readonly sha256?: string;
  readonly license?: string;
  readonly width?: number;
  readonly height?: number;
  /** Rows with art, sorted by `rowIndex`. Every other row follows the fallback order above. */
  readonly rows: readonly SheetRow[];
}
export interface SheetsManifest {
  readonly spec: {
    readonly frame: number;
    readonly maxSize: number;
    readonly dirs: readonly string[];
    readonly actions: readonly { readonly action: string; readonly frames: number }[];
  };
  readonly sheets: readonly SheetEntry[];
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
/** Rectangle of frame `i` of `row`, or undefined when out of range. */
export function frameRect(row: SheetRow, i: number): Rect | undefined {
  const f = row.frames[i];
  return f === undefined ? undefined : { x: f[0], y: f[1], w: FRAME, h: FRAME };
}

/** West-side directions are mirrored from the east side when they have no art of their own. */
export const MIRROR_OF: Readonly<Partial<Record<Dir, Dir>>> = { W: 'E', NW: 'NE', SW: 'SE' };

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

export type ResolvedRow =
  | { readonly source: 'own'; readonly entry: SheetEntry; readonly row: SheetRow; readonly flipX: false }
  | { readonly source: 'mirror'; readonly entry: SheetEntry; readonly row: SheetRow; readonly flipX: true }
  | { readonly source: 'legacy'; readonly legacy: LegacyFallback };

/** Fallback order: own row, then the mirrored east-side row (flipped), then legacy art. */
export function resolveRow(m: SheetsManifest, sprite: string, action: Action, dir: Dir): ResolvedRow {
  const entry = m.sheets.find((s) => s.sprite === sprite);
  if (entry !== undefined) {
    const own = entry.rows.find((r) => r.key === rowKey(action, dir));
    if (own !== undefined) return { source: 'own', entry, row: own, flipX: false };
    const east = MIRROR_OF[dir];
    const mirrored = east === undefined ? undefined : entry.rows.find((r) => r.key === rowKey(action, east));
    if (mirrored !== undefined) return { source: 'mirror', entry, row: mirrored, flipX: true };
  }
  return { source: 'legacy', legacy: legacyFallback(sprite, action, dir) };
}
