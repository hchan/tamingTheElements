import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Element } from '@core/index';
import manifest from '../../src/game/assets/manifest.generated.json';
import { sampleId } from '../../src/game/audio/sample-sfx';

const ASSETS = resolve(import.meta.dirname, '../../public/assets');

function oggInfo(buf: Buffer): { seconds: number; rate: number; channels: number } {
  expect(buf.subarray(0, 4).toString('latin1')).toBe('OggS');
  const id = buf.indexOf(Buffer.from([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73])); // 0x01 "vorbis"
  expect(id).toBeGreaterThan(0);
  const channels = buf.readUInt8(id + 11);
  const rate = buf.readUInt32LE(id + 12);
  const last = buf.lastIndexOf('OggS', buf.length, 'latin1');
  const granule = Number(buf.readBigUInt64LE(last + 6));
  return { seconds: granule / rate, rate, channels };
}

describe('pilot sample files', () => {
  const kinds = ['hit', 'cleanse'] as const;
  const elements: Element[] = ['water', 'fire', 'air', 'earth'];

  it('registers exactly the four hits and four cleanses, in a url that matches the id', () => {
    const ids = manifest.sfxSamples.map((e) => e.id).sort();
    expect(ids).toEqual(kinds.flatMap((k) => elements.map((e) => sampleId(k, e))).sort());
    for (const e of manifest.sfxSamples) expect(e.url).toBe(`audio/${e.id}.ogg`);
  });

  for (const e of manifest.sfxSamples) {
    it(`${e.id}: exists, is mono-or-stereo Ogg Vorbis, under 1.5 s and small`, () => {
      const path = resolve(ASSETS, e.url);
      expect(existsSync(path)).toBe(true);
      const info = oggInfo(readFileSync(path));
      expect(info.seconds).toBeGreaterThan(0.2);
      expect(info.seconds).toBeLessThan(1.5);
      expect(info.channels).toBeLessThanOrEqual(2);
      expect(statSync(path).size).toBeLessThan(80_000);
    });
  }
});
