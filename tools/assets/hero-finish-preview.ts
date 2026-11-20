// Phase 1 preview: cuts sample frames out of the packed hero atlases and writes before/A PNGs to .scratch/hero-finish/<hero>/.
// Read-only on the repo (nothing under public/ or src/ is written). Run: pnpm exec tsx tools/assets/hero-finish-preview.ts [outDir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng, encodePng } from './png-lite.ts';
import { finishFrame, HERO_PARAMS } from './hero-finish.ts';

/** The 12 released heroes. Fiara and treenoc already get a runtime rim, so their rows are reference only (a baked rim would double). */
export const RELEASED = ['curomo', 'cyclonius', 'echo', 'fiara', 'ishimi', 'lavax', 'morblass', 'pax', 'rokcore', 'sindarosa', 'treenoc', 'wispera'];
/** Sample cells: [row key, frame index]. */
export const SAMPLES: readonly (readonly [string, number])[] = [['idle/E', 0], ['walk/E', 1], ['cast/E', 2], ['hurt/E', 0]];

interface Sheet { sprite: string; url: string; frame?: number; rows: { key: string; frames: [number, number][] }[] }

const out = process.argv[2] ?? '.scratch/hero-finish';
const manifest = JSON.parse(readFileSync('src/game/assets/sheets.generated.json', 'utf8')) as { sheets: Sheet[] };
for (const hero of RELEASED) {
  const sheet = manifest.sheets.find((s) => s.sprite === hero);
  if (!sheet?.url) throw new Error(`no sheet for ${hero}`);
  const atlas = decodePng(readFileSync(join('public/assets', sheet.url)));
  const f = sheet.frame ?? 80;
  const dir = join(out, hero);
  mkdirSync(dir, { recursive: true });
  for (const [key, idx] of SAMPLES) {
    const at = sheet.rows.find((r) => r.key === key)?.frames[idx];
    if (!at) {
      console.warn(`${hero}: no ${key}#${String(idx)}, skipped`);
      continue;
    }
    const px = new Uint8Array(f * f * 4);
    for (let y = 0; y < f; y++) px.set(atlas.data.subarray(((at[1] + y) * atlas.width + at[0]) * 4, ((at[1] + y) * atlas.width + at[0] + f) * 4), y * f * 4);
    const name = key.replace('/', '-') + idx;
    writeFileSync(join(dir, `${name}_before.png`), encodePng({ width: f, height: f, data: px }));
    const done = finishFrame(px, f, f, HERO_PARAMS[hero] ?? {});
    writeFileSync(join(dir, `${name}_A.png`), encodePng({ width: f, height: f, data: new Uint8Array(done.buffer) }));
  }
}
console.log(`wrote ${out}`);
