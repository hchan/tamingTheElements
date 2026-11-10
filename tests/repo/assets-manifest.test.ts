import { readFileSync } from 'node:fs';
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
});
