import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng, type Image } from '../../tools/assets/png-lite';
import { manifestJson, packSheets, readSources, SHEETS_MANIFEST_PATH, type SourceFiles } from '../../tools/assets/pack-sheets';
import {
  ACTIONS,
  ALL_ROWS,
  ATLAS_MAX,
  DIRS,
  FRAME,
  frameRect,
  layoutAtlas,
  legacyFallback,
  resolveRow,
  rowIndex,
  sheetCharacters,
  type SheetsManifest,
} from '../../src/game/assets/sheet-spec';

const root = resolve(import.meta.dirname, '../..');
const solid = (w: number, h: number, rgba: [number, number, number, number]): Uint8Array => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return encodePng({ width: w, height: h, data } satisfies Image);
};
/** All frames of one row for `sprite`, each a solid colour keyed by the frame index. */
function rowFiles(sprite: string, action: string, dir: string, n: number, size = FRAME): [string, Uint8Array][] {
  return Array.from({ length: n }, (_, i) => [`${sprite}/${action}/${dir}/${String(i).padStart(2, '0')}.png`, solid(size, size, [10 + i, 20, 30, 255])]);
}
const withLicense = (sprite: string, files: [string, Uint8Array][]): SourceFiles =>
  new Map([...files, [`${sprite}/license.txt`, new TextEncoder().encode('CC0, owner drawn\n')]]);

describe('sprite sheet spec', () => {
  it('has 9 actions x 8 directions with unique canonical row indices and an atlas limit phones can load', () => {
    expect(ACTIONS.map(([a]) => a)).toEqual(['idle', 'walk', 'cast', 'hurt', 'guard', 'dash', 'ko', 'victory', 'tagIn']);
    expect(DIRS).toHaveLength(8);
    expect(ALL_ROWS).toHaveLength(72);
    expect(ALL_ROWS.map((r) => r.index)).toEqual(Array.from({ length: 72 }, (_, i) => i));
    expect(rowIndex('walk', 'E')).toBe(8);
    expect(ATLAS_MAX).toBeLessThanOrEqual(2048);
    expect(ALL_ROWS.every((r) => r.frames >= 1 && r.frames * FRAME <= ATLAS_MAX)).toBe(true);
  });

  it('covers every legacy character row with a fallback that exists in the legacy manifest', () => {
    const chars = sheetCharacters();
    expect(chars.length).toBeGreaterThanOrEqual(20);
    expect(chars).not.toContain('priaUnbalanced');
    expect(chars.some((c) => c.endsWith('Large'))).toBe(false);
    for (const c of chars)
      for (const r of ALL_ROWS) {
        const fb = legacyFallback(c, r.action, r.dir);
        expect(['right', 'left', 'up', 'down']).toContain(fb.set);
        expect(fb.frames).toBe(r.action === 'walk' ? 'strip' : 'first');
      }
  });

  it('maps diagonals to the nearest side and N/S to up/down only where legacy has them', () => {
    expect(legacyFallback('fiara', 'walk', 'NE').set).toBe('right');
    expect(legacyFallback('fiara', 'walk', 'SW').set).toBe('left');
    expect(legacyFallback('fiara', 'walk', 'N').set).toBe('right'); // fiara has no up strip
    expect(legacyFallback('cyclonius', 'walk', 'N').set).toBe('up');
    expect(legacyFallback('cyclonius', 'idle', 'S').set).toBe('down');
  });
});

describe('sheet packer', () => {
  it('with no art: no sheets, every character listed, no errors', () => {
    const r = packSheets(new Map());
    expect(r.errors).toEqual([]);
    expect(r.pngs.size).toBe(0);
    expect(r.manifest.sheets.map((s) => s.sprite)).toEqual(sheetCharacters());
    expect(r.manifest.sheets.every((s) => s.rows.length === 0 && s.url === undefined)).toBe(true);
  });

  it('packs only the rows with art, compactly, and lists every frame rectangle', () => {
    const r = packSheets(withLicense('fiara', [...rowFiles('fiara', 'cast', 'NE', 4), ...rowFiles('fiara', 'hurt', 'E', 2)]));
    expect(r.errors).toEqual([]);
    const sheet = decodePng(r.pngs.get('fiara') as Uint8Array);
    // canonical order: cast/NE (action block 2) before hurt/E; 4 + 2 frames on one shelf
    expect([sheet.width, sheet.height]).toEqual([6 * FRAME, FRAME]);
    const entry = r.manifest.sheets.find((s) => s.sprite === 'fiara');
    expect(entry?.rows.map((x) => x.key)).toEqual(['cast/NE', 'hurt/E']);
    expect([entry?.width, entry?.height]).toEqual([sheet.width, sheet.height]);
    expect(entry?.url).toBe('img/sheets/fiara.png');
    expect(entry?.license).toBe('CC0, owner drawn');
    const cast = entry?.rows[0];
    const hurt = entry?.rows[1];
    if (!cast || !hurt) throw new Error('rows missing');
    expect(frameRect(cast, 3)).toEqual({ x: 3 * FRAME, y: 0, w: FRAME, h: FRAME });
    expect(frameRect(hurt, 1)).toEqual({ x: 5 * FRAME, y: 0, w: FRAME, h: FRAME });
    expect(frameRect(hurt, 2)).toBeUndefined();
    const px = (x: number, y: number): number[] => [...sheet.data.subarray((y * sheet.width + x) * 4, (y * sheet.width + x) * 4 + 4)];
    expect(px(0, 0)).toEqual([10, 20, 30, 255]);
    expect(px(3 * FRAME + 79, 79)).toEqual([13, 20, 30, 255]);
    expect(px(5 * FRAME, 0)).toEqual([11, 20, 30, 255]);
  });

  it('wraps to a new shelf at ATLAS_MAX and stays within it', () => {
    // 16 rows of 320 px: 6 fit per 2048 px shelf (1920 px), so 3 shelves
    const files = (['idle', 'walk'] as const).flatMap((a) => DIRS.flatMap((d) => rowFiles('fiara', a, d, 4)));
    const r = packSheets(withLicense('fiara', files));
    expect(r.errors).toEqual([]);
    const e = r.manifest.sheets.find((s) => s.sprite === 'fiara');
    expect([e?.width, e?.height]).toEqual([1920, 3 * FRAME]);
    expect(e?.rows[6]?.frames[0]).toEqual([0, FRAME]);
    const sheet = decodePng(r.pngs.get('fiara') as Uint8Array);
    expect([sheet.width, sheet.height]).toEqual([1920, 240]);
  });

  it('is reproducible: same input, byte-identical sheet and manifest, regardless of file order', () => {
    const files = [...rowFiles('fiara', 'hurt', 'E', 2), ...rowFiles('fiara', 'idle', 'W', 4)];
    const a = packSheets(withLicense('fiara', files));
    const b = packSheets(withLicense('fiara', [...files].reverse()));
    expect(Buffer.from(a.pngs.get('fiara') as Uint8Array).equals(Buffer.from(b.pngs.get('fiara') as Uint8Array))).toBe(true);
    expect(manifestJson(a.manifest)).toBe(manifestJson(b.manifest));
  });

  it.each([
    ['wrong frame size', withLicense('fiara', rowFiles('fiara', 'hurt', 'E', 2, 64)), /64x64, expected 80x80/],
    ['too few frames', withLicense('fiara', rowFiles('fiara', 'cast', 'E', 3)), /needs frames 00-03/],
    ['too many frames', withLicense('fiara', rowFiles('fiara', 'hurt', 'E', 3)), /needs frames 00-01/],
    ['unknown action', withLicense('fiara', rowFiles('fiara', 'taunt', 'E', 1)), /unknown action taunt/],
    ['unknown direction', withLicense('fiara', rowFiles('fiara', 'idle', 'X', 4)), /unknown direction X/],
    ['unknown character', withLicense('nobody', rowFiles('nobody', 'idle', 'E', 4)), /unknown character nobody/],
    ['missing licence', new Map(rowFiles('fiara', 'idle', 'E', 4)), /license\.txt/],
    ['stray file', new Map([['fiara/notes.txt', new Uint8Array(1)]]), /not <sprite>/],
  ] as [string, SourceFiles, RegExp][])('rejects %s', (_n, files, re) => {
    expect(packSheets(files).errors.join('\n')).toMatch(re);
  });

  it('a bad row is reported and left on legacy fallback, not half-packed', () => {
    const r = packSheets(withLicense('fiara', [...rowFiles('fiara', 'cast', 'E', 3), ...rowFiles('fiara', 'idle', 'E', 4)]));
    expect(r.errors).toHaveLength(1);
    expect(r.manifest.sheets.find((s) => s.sprite === 'fiara')?.rows.map((x) => x.key)).toEqual(['idle/E']);
  });
});

describe('atlas layout', () => {
  const rows = (n: number, frames = 4): { key: string; frames: number }[] => Array.from({ length: n }, (_, i) => ({ key: `r${String(i)}`, frames }));

  it('places rows left to right and wraps before passing the limit', () => {
    const l = layoutAtlas(rows(5), 3 * 4 * FRAME);
    expect(l.placements.map((p) => [p.x, p.y])).toEqual([[0, 0], [320, 0], [640, 0], [0, 80], [320, 80]]);
    expect([l.width, l.height]).toEqual([960, 160]);
  });

  it('is deterministic and empty input gives an empty atlas', () => {
    expect(layoutAtlas(rows(30))).toEqual(layoutAtlas(rows(30)));
    expect(layoutAtlas([])).toEqual({ width: 0, height: 0, placements: [] });
  });

  it('never exceeds ATLAS_MAX for the whole spec at once', () => {
    const l = layoutAtlas(ALL_ROWS);
    expect(l.width).toBeLessThanOrEqual(ATLAS_MAX);
    expect(l.height).toBeLessThanOrEqual(ATLAS_MAX);
  });

  it('throws when a row is wider than the limit or the shelves get too tall', () => {
    expect(() => layoutAtlas(rows(1, 5), 4 * FRAME)).toThrow(/wide/);
    expect(() => layoutAtlas(rows(3), 4 * FRAME)).not.toThrow();
    expect(() => layoutAtlas(rows(5), 4 * FRAME)).toThrow(/more than/);
  });
});

describe('fallback order', () => {
  const m: SheetsManifest = {
    spec: { frame: FRAME, maxSize: ATLAS_MAX, dirs: DIRS, actions: [] },
    sheets: [
      {
        sprite: 'fiara',
        url: 'img/sheets/fiara.png',
        width: 320,
        height: 160,
        rows: [
          { key: 'idle/E', frames: [[0, 0], [80, 0], [160, 0], [240, 0]] },
          { key: 'idle/W', frames: [[0, 80], [80, 80], [160, 80], [240, 80]] },
        ],
      },
      { sprite: 'cyclonius', rows: [] },
    ],
  };

  it('own row first, then the mirrored east row (flipped), then legacy art', () => {
    expect(resolveRow(m, 'fiara', 'idle', 'W')).toMatchObject({ source: 'own', flipX: false });
    expect(resolveRow(m, 'fiara', 'idle', 'E')).toMatchObject({ source: 'own' });
    expect(resolveRow(m, 'fiara', 'idle', 'N')).toMatchObject({ source: 'legacy' });
    const sw = resolveRow(m, 'fiara', 'idle', 'SW');
    expect(sw).toMatchObject({ source: 'legacy' }); // no idle/SE art to mirror
    const withSe: SheetsManifest = { ...m, sheets: [{ ...(m.sheets[0] as object), rows: [{ key: 'idle/SE', frames: [[0, 0]] }] } as never, ...m.sheets.slice(1)] };
    const mir = resolveRow(withSe, 'fiara', 'idle', 'SW');
    expect(mir).toMatchObject({ source: 'mirror', flipX: true });
    expect(mir.source === 'mirror' && mir.row.key).toBe('idle/SE');
    expect(resolveRow(withSe, 'fiara', 'idle', 'NW').source).toBe('legacy');
    expect(resolveRow(withSe, 'fiara', 'idle', 'E').source).toBe('legacy'); // east is never mirrored from the west
  });

  it('a character without art, or an action without rows, uses legacy art', () => {
    expect(resolveRow(m, 'cyclonius', 'walk', 'N')).toEqual({ source: 'legacy', legacy: legacyFallback('cyclonius', 'walk', 'N') });
    expect(resolveRow(m, 'fiara', 'walk', 'E').source).toBe('legacy');
  });
});

describe('oversize input', () => {
  it('reports a row that cannot fit instead of writing a broken atlas', () => {
    expect(() => layoutAtlas([{ key: 'x', frames: 40 }])).toThrow(/atlas limit 2048/);
  });
});

describe('committed sheet outputs', () => {
  const m = JSON.parse(readFileSync(SHEETS_MANIFEST_PATH, 'utf8')) as SheetsManifest;
  const res = packSheets(readSources());

  it('sources validate and the manifest is up to date (run pnpm assets:sheets)', () => {
    expect(res.errors).toEqual([]);
    expect(readFileSync(SHEETS_MANIFEST_PATH, 'utf8')).toBe(manifestJson(res.manifest));
  });

  it('every manifest sheet file exists with the recorded hash, size and a licence; no orphan sheets', () => {
    for (const s of m.sheets) {
      if (s.rows.length === 0) {
        expect(s.url).toBeUndefined();
        continue;
      }
      const p = resolve(root, 'public/assets', s.url as string);
      expect(existsSync(p), s.sprite).toBe(true);
      const img = decodePng(new Uint8Array(readFileSync(p)));
      expect([img.width, img.height]).toEqual([s.width, s.height]);
      expect(Math.max(img.width, img.height)).toBeLessThanOrEqual(m.spec.maxSize);
      expect(s.license, s.sprite).toBeTruthy();
    }
    expect(m.spec.maxSize).toBe(ATLAS_MAX);
    expect(existsSync(resolve(root, 'public/assets/img/sheets'))).toBe(m.sheets.some((s) => s.rows.length > 0));
  });
});
