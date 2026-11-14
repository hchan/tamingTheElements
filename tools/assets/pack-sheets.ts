// Sprite sheet packer (FUN-DESIGN section 2.16 step 2). Builds one compact atlas per character from per-frame PNGs under imgWorkArea/sheets
// and writes src/game/assets/sheets.generated.json. Characters or rows without art follow the fallback order of sheet-spec.ts.
// Run: pnpm assets:sheets (writes) or pnpm assets:sheets --check (fails if the committed outputs are stale). Deterministic and idempotent.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { decodePng, encodePng, type Image } from './png-lite';
import {
  ACTIONS,
  ALL_ROWS,
  ATLAS_MAX,
  ATLAS_MAX_HERO,
  DIRS,
  FRAME,
  layoutAtlas,
  OUT_DIR,
  SHEET_MAX_BYTES,
  SOURCE_DIR,
  sheetCharacters,
  type SheetEntry,
  type SheetRow,
  type SheetsManifest,
} from './sheet-spec';

export type { SheetEntry, SheetsManifest };

const root = resolve(import.meta.dirname, '../..');
export const SHEETS_MANIFEST_PATH = resolve(root, 'src/game/assets/sheets.generated.json');

/** Source files keyed by path relative to SOURCE_DIR, e.g. `fiara/cast/E/00.png`, `fiara/license.txt`. */
export type SourceFiles = ReadonlyMap<string, Uint8Array>;

export interface PackResult {
  readonly manifest: SheetsManifest;
  /** Atlas PNG bytes by sprite name (only characters with art). */
  readonly pngs: ReadonlyMap<string, Uint8Array>;
  readonly errors: readonly string[];
}

const FRAME_RE = /^([A-Za-z0-9]+)\/([A-Za-z]+)\/([A-Z]+)\/(\d{2})\.png$/;
/** Optional `<sprite>/box.json`: `[x, y, w, h]`, the frame-space rect that maps onto the visual box (the bake writes it for rigs with a `box`). */
const BOX_RE = /^([A-Za-z0-9]+)\/box\.json$/;
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

export function packSheets(files: SourceFiles): PackResult {
  const errors: string[] = [];
  const characters = sheetCharacters();
  const known = new Set(characters);
  const actionNames = new Set<string>(ACTIONS.map(([a]) => a));
  const dirNames = new Set<string>(DIRS);
  // sprite -> row key -> frame index -> bytes
  const found = new Map<string, Map<string, Map<number, Uint8Array>>>();
  const licenses = new Map<string, string>();
  const boxes = new Map<string, unknown>();
  for (const [path, bytes] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const lic = /^([A-Za-z0-9]+)\/license\.txt$/.exec(path);
    if (lic) {
      licenses.set(lic[1] as string, new TextDecoder().decode(bytes).trim());
      continue;
    }
    if (path.endsWith('.gitkeep')) continue;
    const bx = BOX_RE.exec(path);
    if (bx) {
      try {
        boxes.set(bx[1] as string, JSON.parse(new TextDecoder().decode(bytes)) as unknown);
      } catch (e) {
        errors.push(`${path}: ${(e as Error).message}`);
      }
      continue;
    }
    const m = FRAME_RE.exec(path);
    if (!m) {
      errors.push(`${path}: not <sprite>/<action>/<dir>/<NN>.png`);
      continue;
    }
    const [, sprite, action, dir, nn] = m as unknown as [string, string, string, string, string];
    if (!known.has(sprite)) errors.push(`${path}: unknown character ${sprite}`);
    else if (!actionNames.has(action)) errors.push(`${path}: unknown action ${action}`);
    else if (!dirNames.has(dir)) errors.push(`${path}: unknown direction ${dir}`);
    else {
      const rows = found.get(sprite) ?? new Map<string, Map<number, Uint8Array>>();
      const key = `${action}/${dir}`;
      const frames = rows.get(key) ?? new Map<number, Uint8Array>();
      frames.set(Number(nn), bytes);
      rows.set(key, frames);
      found.set(sprite, rows);
    }
  }

  const pngs = new Map<string, Uint8Array>();
  const sheets: SheetEntry[] = [];
  for (const sprite of characters) {
    const rows = found.get(sprite);
    // Validated rows in canonical order, frames decoded and checked. Every frame of a sprite has one square size (the first one's).
    const good: { key: string; frames: number; images: Image[] }[] = [];
    let frame = 0;
    for (const row of ALL_ROWS) {
      const frames = rows?.get(row.key);
      if (!frames) continue;
      let ok = true;
      for (let i = 0; i < row.frames; i++) if (!frames.has(i)) ok = false;
      if (frames.size !== row.frames || !ok) {
        errors.push(`${sprite}/${row.key}: needs frames 00-${String(row.frames - 1).padStart(2, '0')}, found ${[...frames.keys()].sort((a, b) => a - b).join(',')}`);
        continue;
      }
      const images: Image[] = [];
      for (let i = 0; i < row.frames; i++) {
        let img: Image;
        try {
          img = decodePng(frames.get(i) as Uint8Array);
        } catch (e) {
          errors.push(`${sprite}/${row.key}/${i}: ${(e as Error).message}`);
          ok = false;
          continue;
        }
        if (frame === 0 && img.width === img.height && img.width >= FRAME) frame = img.width;
        const want = frame === 0 ? FRAME : frame;
        if (img.width !== want || img.height !== want) {
          errors.push(`${sprite}/${row.key}/${i}: ${img.width}x${img.height}, expected ${want}x${want} (one square frame size per sprite)`);
          ok = false;
          continue;
        }
        images.push(img);
      }
      if (ok) good.push({ key: row.key, frames: row.frames, images });
    }
    if (good.length === 0) {
      sheets.push({ sprite, rows: [] });
      continue;
    }
    const license = licenses.get(sprite);
    if (!license) errors.push(`${sprite}: art without ${SOURCE_DIR}/${sprite}/license.txt (every new asset needs a licence note)`);
    const box = boxes.get(sprite);
    const boxOk = box === undefined || validBox(box, frame);
    if (!boxOk) errors.push(`${sprite}/box.json: expected [x, y, w, h] non-negative integers inside the ${String(frame)} px frame`);
    // Byte-identical frames (often whole rows: N bakes NE, S bakes SE) are stored once and rows share their rects. Only the new
    // frames of each row go through the shelf packer, in canonical row order, so the layout stays deterministic. The 80 px
    // sheets are not deduped, so their atlases stay byte-identical to the ones packed before frame sizes existed.
    const dedupe = frame !== FRAME;
    const seen = new Map<string, { u: number; i: number }>();
    const uniq: { key: string; frames: number; images: Image[] }[] = [];
    const refs = good.map((row) =>
      row.images.map((img, i) => {
        const h = dedupe ? sha256(img.data) : `${row.key}#${String(i)}`;
        let at = seen.get(h);
        if (at === undefined) {
          let u = uniq[uniq.length - 1];
          if (u?.key !== row.key) uniq.push((u = { key: row.key, frames: 0, images: [] }));
          u.images.push(img);
          at = { u: uniq.length - 1, i: u.frames++ };
          seen.set(h, at);
        }
        return at;
      }),
    );
    let layout;
    try {
      layout = layoutAtlas(uniq, frame > FRAME ? ATLAS_MAX_HERO : ATLAS_MAX, frame);
    } catch (e) {
      errors.push(`${sprite}: ${(e as Error).message}`);
      sheets.push({ sprite, rows: [] });
      continue;
    }
    const { width, height, placements } = layout;
    const data = new Uint8Array(width * height * 4);
    uniq.forEach((row, n) => {
      const at = placements[n] as { x: number; y: number };
      row.images.forEach((img, i) => {
        const fx = at.x + i * frame;
        for (let y = 0; y < frame; y++) data.set(img.data.subarray(y * frame * 4, (y + 1) * frame * 4), ((at.y + y) * width + fx) * 4);
      });
    });
    const outRows: SheetRow[] = good.map((row, n) => ({
      key: row.key,
      frames: (refs[n] ?? []).map(({ u, i }) => {
        const at = placements[u] as { x: number; y: number };
        return [at.x + i * frame, at.y] as const;
      }),
    }));
    const png = encodePng({ width, height, data });
    if (png.length > SHEET_MAX_BYTES) errors.push(`${sprite}: atlas is ${String(png.length)} B, budget ${String(SHEET_MAX_BYTES)} B per sheet`);
    pngs.set(sprite, png);
    // `frame` and `box` only for frames other than the spec's, so the 80 px sheets keep their manifest bytes.
    const extra =
      frame === FRAME ? {} : { frame, box: boxOk && box !== undefined ? (box as [number, number, number, number]) : ([0, 0, frame, frame] as const) };
    sheets.push({ sprite, url: `img/sheets/${sprite}.png`, sha256: sha256(png), license: license ?? '', width, height, ...extra, rows: outRows });
  }
  return {
    manifest: {
      spec: { frame: FRAME, maxSize: ATLAS_MAX, dirs: DIRS, actions: ACTIONS.map(([action, frames]) => ({ action, frames })) },
      sheets,
    },
    pngs,
    errors,
  };
}

function validBox(b: unknown, frame: number): boolean {
  if (!Array.isArray(b) || b.length !== 4 || !b.every((v) => Number.isInteger(v) && (v as number) >= 0)) return false;
  const [x, y, w, h] = b as [number, number, number, number];
  return w > 0 && h > 0 && x + w <= frame && y + h <= frame;
}

export const manifestJson =(m: SheetsManifest): string => `${JSON.stringify(m)}\n`;

function walk(dir: string, base = ''): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((n) => {
      const rel = base === '' ? n : `${base}/${n}`;
      return statSync(join(dir, n)).isDirectory() ? walk(join(dir, n), rel) : [rel];
    });
}

export function readSources(dir = resolve(root, SOURCE_DIR)): SourceFiles {
  return new Map(walk(dir).map((rel) => [rel, new Uint8Array(readFileSync(join(dir, rel)))]));
}

if (import.meta.main) {
  const check = process.argv.includes('--check');
  const res = packSheets(readSources());
  if (res.errors.length > 0) {
    console.error(res.errors.join('\n'));
    process.exit(1);
  }
  const outDir = resolve(root, OUT_DIR);
  const json = manifestJson(res.manifest);
  const stale: string[] = [];
  if (!existsSync(SHEETS_MANIFEST_PATH) || readFileSync(SHEETS_MANIFEST_PATH, 'utf8') !== json) stale.push(SHEETS_MANIFEST_PATH);
  for (const [sprite, png] of res.pngs) {
    const p = join(outDir, `${sprite}.png`);
    if (!existsSync(p) || sha256(readFileSync(p)) !== sha256(png)) stale.push(p);
  }
  const wanted = new Set([...res.pngs.keys()].map((s) => `${s}.png`));
  for (const f of existsSync(outDir) ? readdirSync(outDir) : []) if (!wanted.has(f)) stale.push(join(outDir, f));
  if (check) {
    if (stale.length > 0) {
      console.error(`stale sheet outputs (run pnpm assets:sheets):\n${stale.join('\n')}`);
      process.exit(1);
    }
  } else {
    writeFileSync(SHEETS_MANIFEST_PATH, json);
    for (const [sprite, png] of res.pngs) {
      mkdirSync(dirname(join(outDir, `${sprite}.png`)), { recursive: true });
      writeFileSync(join(outDir, `${sprite}.png`), png);
    }
    for (const f of existsSync(outDir) ? readdirSync(outDir) : []) if (!wanted.has(f)) rmSync(join(outDir, f));
  }
  console.log(`${res.pngs.size} sheet(s) packed, ${res.manifest.sheets.length - res.pngs.size} character(s) on legacy fallback${check ? ' (check ok)' : ''}`);
}
