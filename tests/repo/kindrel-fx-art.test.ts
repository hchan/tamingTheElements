import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KINDREL_FX, verify } from '../../tools/assets/integrate-kindrel-art';

const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');
const PROV = 'tools/assets/fx-gen/provenance/kindrel-fx';

describe('Kindrel cast sprites (tools/assets/integrate-kindrel-art.ts)', () => {
  it('the committed approval and sources verify, and the shipped fx files are the approved ones', () => {
    expect(verify(PROV).sort()).toEqual(['cinderSpray', 'emberBite']);
    for (const [name, pin] of Object.entries(KINDREL_FX)) {
      expect(sha(`public/assets/img/fx/${name}.png`), name).toBe(pin.sha256);
      expect(sha(`${PROV}/${name}.png`), name).toBe(pin.sha256);
    }
  });
});
