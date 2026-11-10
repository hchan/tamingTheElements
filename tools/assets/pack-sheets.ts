// Sprite sheet packer (FUN-DESIGN section 2.16 step 2). Builds one sheet per character from per-frame PNGs under imgWorkArea/sheets
// and writes src/game/assets/sheets.generated.json. Characters or rows without art are listed as legacy fallbacks (see sheet-spec.ts).
// Run: pnpm assets:sheets (writes) or pnpm assets:sheets --check (fails if the committed outputs are stale). Deterministic and idempotent.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { decodePng, encodePng } from './png-lite';
import {
  ACTIONS,
  ALL_ROWS,
  DIRS,
  FRAME,
  OUT_DIR,
  SHEET_COLS,
  SHEET_H,
  SHEET_W,
  SOURCE_DIR,
  sheetCharacters,
} from './sheet-spec';

const root = resolve(import.meta.dirname, '../..');
export const SHEETS_MANIFEST_PATH = resolve(root, 'src/game/assets/sheets.generated.json');

/** Source files keyed by path relative to SOURCE_DIR, e.g. `fiara/cast/E/00.png`, `fiara/license.txt`. */
export type SourceFiles = ReadonlyMap<string, Uint8Array>;

export interface SheetEntry {
  readonly sprite: string;
  /** Present only when at least one row has art. */
  readonly url?: string;
  readonly sha256?: string;
  readonly license?: string;
  /** Rows with art, as `action/dir`. Every other row uses `legacyFallback(sprite, action, dir)` (sheet-spec.ts), so none are listed. */
  readonly rows: readonly string[];
}

export interface SheetsManifest {
  readonly spec: {
    readonly frame: number;
    readonly cols: number;
    readonly width: number;
    readonly height: number;
    readonly dirs: readonly string[];
    readonly actions: readonly { readonly action: string; readonly frames: number }[];
  };
  readonly sheets: readonly SheetEntry[];
}

export interface PackResult {
  readonly manifest: SheetsManifest;
  /** Sheet PNG bytes by sprite name (only characters with art). */
  readonly pngs: ReadonlyMap<string, Uint8Array>;
  readonly errors: readonly string[];
}

const FRAME_RE = /^([A-Za-z0-9]+)\/([A-Za-z]+)\/([A-Z]+)\/(\d{2})\.png$/;
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
  for (const [path, bytes] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const lic = /^([A-Za-z0-9]+)\/license\.txt$/.exec(path);
    if (lic) {
      licenses.set(lic[1] as string, new TextDecoder().decode(bytes).trim());
      continue;
    }
    if (path.endsWith('.gitkeep')) continue;
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
    const present: string[] = [];
    const sheet = new Uint8Array(SHEET_W * SHEET_H * 4);
    const rows = found.get(sprite);
    for (const row of ALL_ROWS) {
      const frames = rows?.get(row.key);
      if (!frames) continue;
      let ok = true;
      for (let i = 0; i < row.frames; i++) if (!frames.has(i)) ok = false;
      if (frames.size !== row.frames || !ok) {
        errors.push(`${sprite}/${row.key}: needs frames 00-${String(row.frames - 1).padStart(2, '0')}, found ${[...frames.keys()].sort((a, b) => a - b).join(',')}`);
        continue;
      }
      for (let i = 0; i < row.frames; i++) {
        let img;
        try {
          img = decodePng(frames.get(i) as Uint8Array);
        } catch (e) {
          errors.push(`${sprite}/${row.key}/${i}: ${(e as Error).message}`);
          ok = false;
          continue;
        }
        if (img.width !== FRAME || img.height !== FRAME) {
          errors.push(`${sprite}/${row.key}/${i}: ${img.width}x${img.height}, expected ${FRAME}x${FRAME}`);
          ok = false;
          continue;
        }
        for (let y = 0; y < FRAME; y++) {
          sheet.set(img.data.subarray(y * FRAME * 4, (y + 1) * FRAME * 4), ((row.index * FRAME + y) * SHEET_W + i * FRAME) * 4);
        }
      }
      if (ok) present.push(row.key);
    }
    if (present.length === 0) {
      sheets.push({ sprite, rows: [] });
      continue;
    }
    const license = licenses.get(sprite);
    if (!license) errors.push(`${sprite}: art without ${SOURCE_DIR}/${sprite}/license.txt (every new asset needs a licence note)`);
    const png = encodePng({ width: SHEET_W, height: SHEET_H, data: sheet });
    pngs.set(sprite, png);
    sheets.push({ sprite, url: `img/sheets/${sprite}.png`, sha256: sha256(png), license: license ?? '', rows: present });
  }
  return {
    manifest: {
      spec: {
        frame: FRAME,
        cols: SHEET_COLS,
        width: SHEET_W,
        height: SHEET_H,
        dirs: DIRS,
        actions: ACTIONS.map(([action, frames]) => ({ action, frames })),
      },
      sheets,
    },
    pngs,
    errors,
  };
}

export const manifestJson = (m: SheetsManifest): string => `${JSON.stringify(m)}\n`;

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
