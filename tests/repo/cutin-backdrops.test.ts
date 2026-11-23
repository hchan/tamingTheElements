import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HEROES = ['abyssor', 'brazgor', 'durrok', 'glimmaw', 'hyalia', 'kindrel', 'nykra', 'ouroth', 'quarrak', 'umbrel', 'vortigal', 'zephra'];
const PINS = JSON.parse(readFileSync('tools/assets/cutin-comp/provenance/pins.json', 'utf8')) as Record<string, { source: string; sha256: string }>;

describe('roster24 super cut-in composites', () => {
  it.each(HEROES)('%s is a pinned 1344x768 PNG', (hero) => {
    const f = `public/assets/img/cutin/${hero}.png`;
    expect(existsSync(f), f).toBe(true);
    const b = readFileSync(f);
    expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([1344, 768]);
    expect(createHash('sha256').update(b).digest('hex')).toBe(PINS[hero]?.sha256);
  });
  it('ships its approval record with art-director verdicts for all 12 heroes', () => {
    const a = JSON.parse(readFileSync('tools/assets/cutin-comp/provenance/approval.json', 'utf8')) as {
      reviewer: string;
      beats_shipped: boolean;
      heroes: Record<string, { verdict: string; score: number }>;
    };
    expect(a).toMatchObject({ reviewer: 'art-director', beats_shipped: true });
    expect(Object.keys(a.heroes).sort()).toEqual(HEROES);
    for (const v of Object.values(a.heroes)) {
      expect(v.verdict).toBe('APPROVE');
      expect(v.score).toBeGreaterThanOrEqual(4);
    }
  });
});
