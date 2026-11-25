import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'public/assets/img/ko';
const approval = JSON.parse(readFileSync('tools/assets/ko-gen/approval.json', 'utf8')) as Record<string, { approved: string | null; sha256?: string; reviewer: string; beats_shipped: boolean }>;

describe('KO frames (tools/assets/ko-gen/ko-rigonly.py)', () => {
  it('ships only art-director-approved heroes, as PNGs; parked Fiara is absent', () => {
    const shipped = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
    expect(shipped).toEqual(['abyssor_ko.png', 'brazgor_ko.png', 'durrok_ko.png', 'glimmaw_ko.png', 'hyalia_ko.png', 'kindrel_ko.png', 'nykra_ko.png', 'ouroth_ko.png', 'pax_ko.png', 'quarrak_ko.png', 'treenoc_ko.png', 'umbrel_ko.png', 'vortigal_ko.png', 'zephra_ko.png']);
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
    expect(approval['ko_umbrel']?.approved).toBeTruthy();
    expect(approval['ko_nykra']?.approved).toBeTruthy();
    expect(approval['ko_abyssor']?.approved).toBeTruthy();
  });

  it('Umbrel, Abyssor and Nykra are the approved sources (tools/assets/ko-gen/approved), bbox-cropped by install-r24-ko.py', () => {
    const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');
    // Nykra is installed unchanged; the other two are 1024 px squares cropped to the alpha bbox + 12 px, so the shipped file is smaller
    expect(sha(`${DIR}/nykra_ko.png`)).toBe(sha('tools/assets/ko-gen/approved/nykra_ko.png'));
    const dims = (p: string): [number, number] => { const b = readFileSync(p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
    expect(dims(`${DIR}/umbrel_ko.png`)).toEqual([904, 447]);
    expect(dims(`${DIR}/abyssor_ko.png`)).toEqual([905, 500]);
    expect(dims('tools/assets/ko-gen/approved/umbrel_ko.png')).toEqual([1024, 1024]);
    const ap = JSON.parse(readFileSync('tools/assets/ko-gen/approved/approval.json', 'utf8')) as Record<string, { verdict: string }>;
    for (const h of ['umbrel', 'abyssor', 'nykra']) expect(ap[`${h}_ko.png`]?.verdict, h).toBe('APPROVE');
  });
});
