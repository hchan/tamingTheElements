import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'public/assets/img/ko';
const approval = JSON.parse(readFileSync('tools/assets/ko-gen/approval.json', 'utf8')) as Record<string, { approved: string | null; sha256?: string; reviewer: string; beats_shipped: boolean }>;

describe('KO frames (tools/assets/ko-gen/ko-rigonly.py)', () => {
  it('ships only art-director-approved heroes, as PNGs; parked Fiara is absent', () => {
    const shipped = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
    expect(shipped).toEqual(['brazgor_ko.png', 'durrok_ko.png', 'glimmaw_ko.png', 'hyalia_ko.png', 'kindrel_ko.png', 'pax_ko.png', 'quarrak_ko.png', 'treenoc_ko.png', 'zephra_ko.png']);
    for (const f of shipped) {
      const a = approval[`ko_${f.replace('_ko.png', '')}`];
      expect(a?.reviewer, f).toBe('art-director');
      expect(a?.approved, f).toBeTruthy();
      expect(a?.beats_shipped, f).toBe(true);
      const bytes = readFileSync(`${DIR}/${f}`);
      expect(bytes.subarray(1, 4).toString(), f).toBe('PNG');
      expect(createHash('sha256').update(bytes).digest('hex'), f).toBe(a?.sha256);
    }
    expect(approval['ko_fiara']?.approved).toBeNull();
    expect(approval['ko_umbrel']?.approved).toBeNull();
    expect(approval['ko_nykra']?.approved).toBeNull();
    expect(approval['ko_abyssor']?.approved).toBeNull();
  });
});
