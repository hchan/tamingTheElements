import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANIFEST_PATH, type LegacyManifest } from '../../tools/assets/extract-legacy-manifest';

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as LegacyManifest;
const IMG = resolve(import.meta.dirname, '../../public/assets');

function pngSize(url: string): [number, number] {
  const b = readFileSync(resolve(IMG, url));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const LOOPS = ['cinderSpray', 'lureOrb', 'abyssalPull', 'boulderRoll', 'sporeBurst', 'stingingFilament', 'bellPulse', 'staticMote'];
const STATICS = [
  'emberBite', 'cinderSpray', 'hoofCrash', 'kelpLash', 'boulderRoll', 'stingingFilament', 'bellPulse',
  'forgeGore', 'moltenHide', 'lureOrb', 'abyssFlash', 'tuskGore', 'bristleStomp', 'staticMote', 'skitter',
  'wyrmCoil', 'scorchBreath', 'tentacleLash', 'abyssalPull', 'stoop', 'talonRake', 'sporeBurst', 'myceliumMend',
];

describe('roster24 ability art', () => {
  it('keeps the 23 static sprites at their pixel sizes', () => {
    expect(STATICS).toHaveLength(23);
    for (const name of STATICS) {
      const e = manifest.sprites[name];
      if (!e) throw new Error(`${name} row missing`);
      expect(pngSize(`img/fx/${name}.png`), name).toEqual([e.coords[2], e.coords[3]]);
    }
  });

  it.each(LOOPS)('%sLoop is an 8-frame strip at 2x the static', (name) => {
    const loop = manifest.sprites[`${name}Loop`];
    const stat = manifest.sprites[name];
    if (!loop || !stat) throw new Error(`${name}Loop row missing`);
    expect(loop.url).toBe(`img/fx/loop/${name}Loop.png`);
    expect(loop.coords).toEqual([0, 0, stat.coords[2] * 2, stat.coords[3] * 2]);
    expect(pngSize(loop.url)).toEqual([loop.coords[2] * 8, loop.coords[3]]);
  });
});
