import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'public/assets/img/arena-art';
interface Entry { url: string; w: number; h: number; sha256: string; approval: { reviewer: string; beats_shipped: boolean } }

describe('arena art (title splash and element arenas)', () => {
  const index = JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8')) as { images: Record<string, Entry> };
  it('lists exactly the webp files on disk, each with a matching sha256', () => {
    const listed = Object.values(index.images).map((e) => e.url.replace('img/arena-art/', '')).sort();
    expect(readdirSync(DIR).filter((f) => f.endsWith('.webp')).sort()).toEqual(listed);
    for (const e of Object.values(index.images)) {
      expect(existsSync(`public/assets/${e.url}`), e.url).toBe(true);
      expect(createHash('sha256').update(readFileSync(`public/assets/${e.url}`)).digest('hex'), e.url).toBe(e.sha256);
    }
  });
  it('has the splash and the four elements, all arenas the same size (letterbox cropped)', () => {
    expect(Object.keys(index.images).sort()).toEqual(['arena-air', 'arena-earth', 'arena-fire', 'arena-water', 'splash']);
    for (const k of ['arena-air', 'arena-earth', 'arena-fire', 'arena-water']) expect([index.images[k]?.w, index.images[k]?.h], k).toEqual([1344, 741]);
  });
  it('ships its art-director approval record', () => {
    const a = JSON.parse(readFileSync('tools/assets/arena-gen/provenance/approval.json', 'utf8')) as Record<string, { reviewer: string; beats_shipped: boolean }>;
    expect(Object.keys(a).sort()).toEqual(Object.keys(index.images).sort());
    for (const v of Object.values(a)) expect([v.reviewer, v.beats_shipped]).toEqual(['art-director', true]);
  });
});
