import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RING_ART } from '../../src/game/fx/status-ring-art';

const root = resolve(import.meta.dirname, '../..');

describe('status ring plates', () => {
  it('each plate exists as a 128x128 RGBA PNG and is named in approval.json', () => {
    const approval = readFileSync(resolve(root, 'public/assets/img/fx/status/approval.json'), 'utf8');
    for (const art of Object.values(RING_ART)) {
      const file = resolve(root, 'public', art.url);
      expect(existsSync(file), art.url).toBe(true);
      const png = readFileSync(file);
      expect(png.readUInt32BE(16), 'width').toBe(128);
      expect(png.readUInt32BE(20), 'height').toBe(128);
      expect(png[25], 'colour type RGBA').toBe(6);
      const name = /([a-z]+)\.png$/.exec(art.url)?.[1] ?? '';
      expect(approval, name).toContain(name);
    }
  });
});
