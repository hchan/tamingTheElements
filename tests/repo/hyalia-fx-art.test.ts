import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEROES, verify } from '../../tools/assets/integrate-roster24-fx-art';
import { decodePng } from '../../tools/assets/png-lite';

const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('Hyalia cast sprites (tools/assets/integrate-roster24-fx-art.ts)', () => {
  it('the committed approvals and sources verify, and the shipped files are the approved ones', () => {
    const h = HEROES.hyalia;
    expect(h).toBeDefined();
    if (!h) return;
    expect(verify('hyalia')).toEqual(['bellPulse', 'bellPulseLoop', 'stingingFilament']);
    for (const [name, pin] of Object.entries(h.fx)) {
      expect(sha(`public/assets/img/${pin.dst ?? `fx/${name}.png`}`), name).toBe(pin.sha256);
      expect(sha(`${h.provenance}/${pin.src}`), name).toBe(pin.sha256);
    }
  });

  it('the 8 bellPulseLoop frames (160x160) are not all identical (director: effectively a 4-frame cycle, accepted)', () => {
    const img = decodePng(readFileSync('public/assets/img/fx/loop/bellPulseLoop.png'));
    expect([img.width, img.height]).toEqual([1280, 160]);
    const frames = new Set<string>();
    for (let f = 0; f < 8; f++) {
      const h = createHash('sha256');
      for (let y = 0; y < 160; y++) h.update(img.data.subarray((y * 1280 + f * 160) * 4, (y * 1280 + f * 160 + 160) * 4));
      frames.add(h.digest('hex'));
    }
    expect(frames.size).toBeGreaterThan(1);
  });
});
