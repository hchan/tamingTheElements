import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng, type Image } from '../../tools/assets/png-lite';
import { manifestJson, packSheets, readSources, SHEETS_MANIFEST_PATH, type SheetsManifest, type SourceFiles } from '../../tools/assets/pack-sheets';
import { ACTIONS, ALL_ROWS, DIRS, FRAME, legacyFallback, rowIndex, SHEET_H, SHEET_W, sheetCharacters } from '../../tools/assets/sheet-spec';

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
  it('has 9 actions x 8 directions with unique row indices filling the sheet', () => {
    expect(ACTIONS.map(([a]) => a)).toEqual(['idle', 'walk', 'cast', 'hurt', 'guard', 'dash', 'ko', 'victory', 'tagIn']);
    expect(DIRS).toHaveLength(8);
    expect(ALL_ROWS).toHaveLength(72);
    expect(ALL_ROWS.map((r) => r.index)).toEqual(Array.from({ length: 72 }, (_, i) => i));
    expect(rowIndex('walk', 'E')).toBe(8);
    expect(SHEET_W).toBe(320);
    expect(SHEET_H).toBe(80 * 72);
    expect(ALL_ROWS.every((r) => r.frames >= 1 && r.frames * FRAME <= SHEET_W)).toBe(true);
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

  it('packs one row at the right place; the rest of the sheet stays transparent', () => {
    const r = packSheets(withLicense('fiara', rowFiles('fiara', 'cast', 'NE', 4)));
    expect(r.errors).toEqual([]);
    const sheet = decodePng(r.pngs.get('fiara') as Uint8Array);
    expect([sheet.width, sheet.height]).toEqual([SHEET_W, SHEET_H]);
    const px = (x: number, y: number): number[] => [...sheet.data.subarray((y * SHEET_W + x) * 4, (y * SHEET_W + x) * 4 + 4)];
    const y0 = rowIndex('cast', 'NE') * FRAME;
    expect(px(0, y0)).toEqual([10, 20, 30, 255]);
    expect(px(3 * FRAME + 79, y0 + 79)).toEqual([13, 20, 30, 255]);
    expect(px(0, y0 - 1)[3]).toBe(0);
    expect(px(0, y0 + FRAME)[3]).toBe(0);
    const entry = r.manifest.sheets.find((s) => s.sprite === 'fiara');
    expect(entry?.rows).toEqual(['cast/NE']);
    expect(entry?.url).toBe('img/sheets/fiara.png');
    expect(entry?.license).toBe('CC0, owner drawn');
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
    expect(r.manifest.sheets.find((s) => s.sprite === 'fiara')?.rows).toEqual(['idle/E']);
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
      expect([img.width, img.height]).toEqual([m.spec.width, m.spec.height]);
      expect(s.license, s.sprite).toBeTruthy();
    }
    expect(m.spec.width).toBe(SHEET_W);
    expect(existsSync(resolve(root, 'public/assets/img/sheets'))).toBe(m.sheets.some((s) => s.rows.length > 0));
  });
});
