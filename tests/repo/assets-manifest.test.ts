import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { oracleAvailable } from '@testing/legacy/oracle';
import { MANIFEST_PATH, type LegacyManifest } from '../../tools/assets/extract-legacy-manifest';

const committed = readFileSync(MANIFEST_PATH, 'utf8');

describe('legacy asset manifest', () => {
  // Oracle-only: regenerates the manifest from the restored legacy tree; runs in the normal suite whenever .oracle/
  // exists (pnpm oracle:restore), skipped otherwise.
  it.skipIf(!oracleAvailable())('generator is idempotent against the committed JSON', async () => {
    const { buildManifest } = await import('../../tools/assets/extract-legacy-manifest');
    expect(`${JSON.stringify(buildManifest(), null, 2)}\n`).toBe(committed);
  });

  it('has the legacy entry counts and consistent sound ids', () => {
    const m = JSON.parse(committed) as LegacyManifest;
    expect(Object.keys(m.sprites)).toHaveLength(54);
    expect(Object.keys(m.mapSprites).length).toBeGreaterThan(0);
    expect(Object.keys(m.backgrounds).length).toBeGreaterThan(0);
    expect(new Set(m.sounds.map((s) => s.id)).size).toBe(m.sounds.length);
    expect(m.sounds.every((s) => s.url === `snd/${s.id}.ogg`)).toBe(true);
  });

  it('points the redrawn map strips at the generated img/fx files (320x80, four 80x80 frames)', () => {
    const m = JSON.parse(committed) as LegacyManifest;
    for (const key of ['tornado', 'fireCone', 'translucentFlame', 'echoFade', 'circusOfSlime']) {
      expect(m.mapSprites[key]?.url).toBe(`img/fx/${key}.png`);
      const png = readFileSync(resolve(import.meta.dirname, '../../public/assets', `img/fx/${key}.png`));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([320, 80]);
    }
    expect(existsSync(resolve(import.meta.dirname, '../../tools/assets/fx-gen/batch-e-map.py'))).toBe(true);
  });
});
