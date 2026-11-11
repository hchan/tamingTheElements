// Frame lookup for the sprite sheets (FUN-DESIGN section 2.16 step 3, view side). Pure: no Phaser, no clock. The pose layer asks
// `resolveFrame(sprite, action, dir8, t)` each rendered frame and gets either a texture key and frame (own row or the mirrored
// east-side row, see `resolveRow`) or `legacy`, which tells it to draw exactly what it drew before sheets existed. Results are
// built once per (sprite, action, direction, frame) and reused, so the per-frame path allocates nothing.
import generated from './sheets.generated.json' with { type: 'json' };
import { ACTIONS, framesIn, resolveRow, type Action, type Dir, type LegacyFallback, type Rect, type SheetsManifest } from './sheet-spec';

/** Core dir8 (0 east, then counter-clockwise on screen, `src/core/math/dir8.ts`) to the sheet's compass direction. */
export const DIR_OF_DIR8: readonly Dir[] = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];

/**
 * Per action: ms per frame, and whether the row loops or holds its last frame. The one-shot rows last as long as the
 * matching procedural pose (pose-math `POSE_MS`, KO 700 ms); idle loops over the 1.8 s bob; walk is 8 fps at base speed
 * (the pose layer drives it by distance walked, see `walkTime`).
 */
export const FRAME_TIMING: Readonly<Record<Action, { readonly ms: number; readonly loop: boolean }>> = {
  idle: { ms: 450, loop: true },
  walk: { ms: 125, loop: true },
  cast: { ms: 55, loop: false },
  hurt: { ms: 150, loop: false },
  guard: { ms: 70, loop: false },
  dash: { ms: 67, loop: false },
  ko: { ms: 175, loop: false },
  victory: { ms: 225, loop: true },
  tagIn: { ms: 80, loop: false },
};

/** Frame index of `action` at `t` ms into it: loops, or holds the last frame. */
export function frameIndex(action: Action, t: number): number {
  const n = framesIn(action);
  const { ms, loop } = FRAME_TIMING[action];
  const i = t > 0 ? Math.floor(t / ms) : 0;
  return loop ? i % n : Math.min(i, n - 1);
}

/** Walk time for `phase` px walked at `stridePx` per frame, so a sheet's walk row steps with the feet like the legacy strip. */
export const walkTime = (phase: number, stridePx: number): number => (phase / stridePx) * FRAME_TIMING.walk.ms;

export const sheetKey = (sprite: string): string => `sheet:${sprite}`;
export const sheetFrameName = (row: string, i: number): string => `${row}#${String(i)}`;

export interface SheetFrame {
  readonly source: 'own' | 'mirror';
  /** Phaser texture key (`sheet:<sprite>`) and frame name (`<action>/<dir>#<i>`). */
  readonly texture: string;
  readonly frame: string;
  readonly rect: Rect;
  readonly flipX: boolean;
}
export interface LegacyFrame {
  readonly source: 'legacy';
  readonly legacy: LegacyFallback;
}
export type ResolvedFrame = SheetFrame | LegacyFrame;

export interface FrameResolver {
  resolveFrame(sprite: string, action: Action, dir8: number, t: number): ResolvedFrame;
  /** True when `sprite` has an atlas with at least one row (only then is there anything to load). */
  hasSheet(sprite: string): boolean;
  /** Atlas URL relative to `assets/`, or undefined when none. */
  sheetUrl(sprite: string): string | undefined;
  /** Every frame (name and rectangle) to register on the loaded `sheet:<sprite>` texture. */
  frames(sprite: string): readonly { readonly name: string; readonly rect: Rect }[];
}

const ACTION_INDEX = new Map<string, number>(ACTIONS.map(([a], i) => [a, i]));

export function createFrameResolver(m: SheetsManifest): FrameResolver {
  const entries = new Map(m.sheets.filter((s) => s.url !== undefined && s.rows.length > 0).map((s) => [s.sprite, s]));
  /** Per sprite: per (action, dir8) slot, one result per frame (legacy: a single one). */
  const tables = new Map<string, ResolvedFrame[][]>();
  const slot = (sprite: string, action: Action, d: number): ResolvedFrame[] => {
    let table = tables.get(sprite);
    if (table === undefined) tables.set(sprite, (table = []));
    const k = (ACTION_INDEX.get(action) ?? 0) * 8 + d;
    let out = table[k];
    if (out !== undefined) return out;
    const r = resolveRow(m, sprite, action, DIR_OF_DIR8[d] ?? 'E');
    if (r.source === 'legacy') out = [{ source: 'legacy', legacy: r.legacy }];
    else {
      const texture = sheetKey(sprite);
      out = r.row.frames.map(([x, y], i) => ({
        source: r.source, texture, frame: sheetFrameName(r.row.key, i), rect: { x, y, w: m.spec.frame, h: m.spec.frame }, flipX: r.flipX,
      }));
    }
    table[k] = out;
    return out;
  };
  return {
    resolveFrame(sprite, action, dir8, t) {
      const frames = slot(sprite, action, dir8 & 7);
      const first = frames[0] as ResolvedFrame;
      return first.source === 'legacy' ? first : (frames[frameIndex(action, t) % frames.length] ?? first);
    },
    hasSheet: (sprite) => entries.has(sprite),
    sheetUrl: (sprite) => entries.get(sprite)?.url,
    frames: (sprite) =>
      entries.get(sprite)?.rows.flatMap((row) =>
        row.frames.map(([x, y], i) => ({ name: sheetFrameName(row.key, i), rect: { x, y, w: m.spec.frame, h: m.spec.frame } })),
      ) ?? [],
  };
}

/** The committed `sheets.generated.json` (no atlases yet: every frame resolves to legacy). */
export const generatedSheets: SheetsManifest = generated;

let shipped: FrameResolver | undefined;
/** `resolveFrame` over the committed manifest. */
export function resolveFrame(sprite: string, action: Action, dir8: number, t: number): ResolvedFrame {
  return (shipped ??= createFrameResolver(generatedSheets)).resolveFrame(sprite, action, dir8, t);
}
