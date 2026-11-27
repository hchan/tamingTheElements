import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/core/data/characters';
import { boxOfSlug, CHARACTER_DRAWN_EXTRA_PX, drawnExtraOfSlug } from '../../src/core/data/size';
import { RANGED } from '../../src/core/sim/systems/arcade/meter';
import { arcadeHeroScale } from '../../src/game/views/hero-scale';
import { OPAQUE_ALPHA_MIN } from '../../src/game/views/opaque-span';
import { decodePng } from '../../tools/assets/png-lite';

// SIM_VERSION 121: every melee hero needs a CHARACTER_DRAWN_EXTRA_PX row of at least this share of its measured idle overhang
// per side (same method as the widest-idle-frame scan: opaque alpha >= OPAQUE_ALPHA_MIN, drawn at arcadeHeroScale).
const MIN_SHARE_PM = 400;

interface SheetRow { key: string; frames: [number, number][] }
interface Sheet { sprite: string; url: string; frame: number; box: [number, number, number, number]; rows: SheetRow[] }
const SHEETS = (JSON.parse(readFileSync(resolve('src/game/assets/sheets.generated.json'), 'utf8')) as { sheets: Sheet[] }).sheets;

/** Max over the idle frames of the overhang per side in px (the larger of left and right), floored. */
function idleOverhang(slug: string): number {
  const e = SHEETS.find((x) => x.sprite === slug);
  if (e === undefined) return 0;
  const [w, h] = boxOfSlug(slug);
  const k = arcadeHeroScale(h);
  const img = decodePng(readFileSync(resolve('public/assets', e.url)));
  const [bx, , bw] = e.box;
  const sx = (w * k) / bw;
  let best = 0;
  for (const row of e.rows) {
    if (!row.key.startsWith('idle/')) continue;
    for (const [fx, fy] of row.frames) {
      let lo = e.frame;
      let hi = -1;
      for (let y = 0; y < e.frame; y++) {
        for (let x = 0; x < e.frame; x++) {
          if ((img.data[((fy + y) * img.width + fx + x) * 4 + 3] ?? 0) < OPAQUE_ALPHA_MIN) continue;
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
      }
      if (hi < 0) continue;
      const left = (w * (k - 1)) / 2 - (lo - bx) * sx;
      const right = (hi + 1 - bx) * sx - (w * (k - 1)) / 2 - w;
      best = Math.max(best, left, right);
    }
  }
  return Math.floor(best);
}

describe('CHARACTER_DRAWN_EXTRA_PX (Hard AI melee wall hold, SIM_VERSION 121)', () => {
  const melee = CHARACTERS.filter((c, i) => RANGED[i] !== 1 && SHEETS.some((x) => x.sprite === c.id));
  it('covers the melee roster (at least the twelve measured heroes)', () => {
    expect(melee.length).toBeGreaterThanOrEqual(12);
  });
  it.each(melee.map((c) => c.id))('%s has an integer row of at least 40% of its measured idle overhang', (slug) => {
    const over = idleOverhang(slug);
    const row = CHARACTER_DRAWN_EXTRA_PX[slug];
    if (over < 8) return; // narrow art: no row needed
    expect(row, `${slug} needs a CHARACTER_DRAWN_EXTRA_PX row (idle overhang ${String(over)} px per side)`).toBeDefined();
    expect(Number.isInteger(row)).toBe(true);
    expect((row ?? 0) * 1000).toBeGreaterThanOrEqual(over * MIN_SHARE_PM - 1000);
  });
  it('ranged heroes have no row', () => {
    for (const [i, c] of CHARACTERS.entries()) if (RANGED[i] === 1) expect(drawnExtraOfSlug(c.id)).toBe(0);
  });
});
