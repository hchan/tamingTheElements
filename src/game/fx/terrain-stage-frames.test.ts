import { describe, expect, it } from 'vitest';
import { ATLAS_H, ATLAS_W, atlasFrames, crowdFrame, farFrame, flyFrame } from './terrain-stage-layout';

describe('terrain stage frame names', () => {
  it('builds the documented names', () => {
    expect(farFrame(1)).toBe('far:1');
    expect(crowdFrame(2, 1)).toBe('crowd:2:1');
    expect(flyFrame(4, 0)).toBe('fly:4:0');
  });

  it('atlasFrames uses exactly these names, unique, all inside the atlas', () => {
    const frames = atlasFrames();
    const names = frames.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (let s = 1; s <= 4; s++) {
      expect(names).toContain(farFrame(s));
      for (let k = 0; k < 3; k++) expect(names).toContain(crowdFrame(s, k));
      for (let k = 0; k < 2; k++) expect(names).toContain(flyFrame(s, k));
    }
    for (const f of frames) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(ATLAS_W);
      expect(f.y + f.h).toBeLessThanOrEqual(ATLAS_H);
    }
  });
});
