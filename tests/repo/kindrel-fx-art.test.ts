import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEROES, verify } from '../../tools/assets/integrate-roster24-fx-art';

const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('Kindrel cast sprites (tools/assets/integrate-roster24-fx-art.ts)', () => {
  it('the committed approval and sources verify, and the shipped fx files are the approved ones', () => {
    const h = HEROES.kindrel;
    expect(h).toBeDefined();
    if (!h) return;
    expect(verify('kindrel').sort()).toEqual(['cinderSpray', 'emberBite']);
    for (const [name, pin] of Object.entries(h.fx)) {
      expect(sha(`public/assets/img/fx/${name}.png`), name).toBe(pin.sha256);
      expect(sha(`${h.provenance}/${pin.src}`), name).toBe(pin.sha256);
    }
  });
});
