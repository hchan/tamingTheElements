import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'public/assets/img/victory';
const PROV = 'tools/assets/victory-gen/provenance';
const SRC_SHA = 'c7199f4d1f28c33538c6e7a8cb13523e142178dcaa0b284dc75472829476a31d';
const OUT_SHA = '9c3445430f2dba2fccf56c066b6985a7fc856748d3705082299f0f605ff2e331';
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('victory frames (tools/assets/victory-gen/victory-key.py)', () => {
  it('ships only the art-director-approved Glimmaw still, as a transparent RGBA PNG', () => {
    expect(readdirSync(DIR).filter((f) => f.endsWith('.png'))).toEqual(['glimmaw_victory.png']);
    const bytes = readFileSync(`${DIR}/glimmaw_victory.png`);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes[25], 'colour type 6 = RGBA').toBe(6);
    expect(sha(`${DIR}/glimmaw_victory.png`)).toBe(OUT_SHA);
  });
  it('pins the approved source and carries its approval', () => {
    const all = JSON.parse(readFileSync(`${PROV}/approval.json`, 'utf8')) as Record<string, { approved: string; reviewer: string; beats_shipped: boolean; facing: string }>;
    const a = all['glimmaw_victory'];
    expect(a?.reviewer).toBe('art-director');
    expect(a?.beats_shipped).toBe(true);
    expect(a?.facing).toBe('right');
    expect(a?.approved).toContain('r971-glimmaw-vic_60160_d0.35.png');
    expect(sha(`${PROV}/r971-glimmaw-vic_60160_d0.35.png`)).toBe(SRC_SHA);
  });
});
