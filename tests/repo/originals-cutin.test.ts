import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HEROES = ['curomo', 'ishimi', 'lavax', 'morblass', 'pax', 'rokcore', 'sindarosa', 'treenoc', 'wispera'];
const PROV = 'tools/assets/originals-cutin/provenance';
type Pin = { source: string; approval: string; sha256: string; bytes: number };
type Entry = { file?: string; verdict: string; overall: number; approved: boolean; reviewer: string };
const PINS = JSON.parse(readFileSync(`${PROV}/pins.json`, 'utf8')) as Record<string, Pin>;

describe('original-hero super cut-in composites', () => {
  it('pins exactly the nine approved heroes (not cyclonius, fiara or echo)', () => {
    expect(Object.keys(PINS).sort()).toEqual(HEROES);
  });
  it.each(HEROES)('%s is a pinned 1344x768 PNG', (hero) => {
    const f = `public/assets/img/cutin/${hero}.png`;
    expect(existsSync(f), f).toBe(true);
    const b = readFileSync(f);
    expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([1344, 768]);
    expect(PINS[hero]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(createHash('sha256').update(b).digest('hex')).toBe(PINS[hero]?.sha256);
    expect(b.length).toBe(PINS[hero]?.bytes);
  });
  it.each(HEROES)('%s has an art-director APPROVE for exactly its source file', (hero) => {
    const pin = PINS[hero] as Pin;
    const a = JSON.parse(readFileSync(`${PROV}/${pin.approval}`, 'utf8')) as Record<string, Entry>;
    const e = a[hero] as Entry;
    expect(e).toMatchObject({ reviewer: 'art-director', verdict: 'APPROVE', approved: true, file: pin.source });
    expect(e.overall).toBeGreaterThanOrEqual(4);
  });
});
