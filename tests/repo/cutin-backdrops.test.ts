import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HEROES = ['abyssor', 'brazgor', 'durrok', 'glimmaw', 'hyalia', 'kindrel', 'nykra', 'ouroth', 'quarrak', 'umbrel', 'vortigal', 'zephra'];

describe('roster24 super cut-in backdrops', () => {
  it.each(HEROES)('%s is a 1344x168 PNG', (hero) => {
    const f = `public/assets/img/cutin/${hero}.png`;
    expect(existsSync(f), f).toBe(true);
    const b = readFileSync(f);
    expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([1344, 168]);
  });
  it('ships its approval record with art-director verdicts', () => {
    const a = JSON.parse(readFileSync('tools/assets/cutin-gen/provenance/approval.json', 'utf8')) as Record<string, unknown>;
    const entries = Object.entries(a).filter(([k]) => !k.startsWith('_')) as [string, { reviewer: string; beats_shipped: boolean }][];
    expect(entries).toHaveLength(12);
    for (const [, v] of entries) expect(v).toMatchObject({ reviewer: 'art-director', beats_shipped: true });
  });
});
