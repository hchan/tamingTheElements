import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MANIFEST_PATH, buildManifest } from '../../tools/assets/extract-legacy-manifest';

describe('legacy asset manifest', () => {
  it('generator is idempotent against the committed JSON', () => {
    const committed = readFileSync(MANIFEST_PATH, 'utf8');
    expect(`${JSON.stringify(buildManifest(), null, 2)}\n`).toBe(committed);
  });

  it('has the legacy entry counts and consistent sound ids', () => {
    const m = buildManifest();
    expect(Object.keys(m.sprites)).toHaveLength(54);
    expect(Object.keys(m.mapSprites).length).toBeGreaterThan(0);
    expect(Object.keys(m.backgrounds).length).toBeGreaterThan(0);
    expect(new Set(m.sounds.map((s) => s.id)).size).toBe(m.sounds.length);
    expect(m.sounds.every((s) => s.url === `snd/${s.id}.ogg`)).toBe(true);
  });

  // Cross-check of src/core/data sprite/sound references lands in WP 56 (data not yet merged).
});
