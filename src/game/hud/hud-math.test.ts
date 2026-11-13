import { describe, expect, it } from 'vitest';
import { HUD_WIDTH, benchBar, mainBar, sideOffset } from './bars';
import { BENCH_TOP, PORTRAIT, barGrain, benchPortraitRect, chipRowTop, comboKey, edgeGrainFlecks, portraitX, regenAnchor } from './hud-math';

describe('portraitX', () => {
  it('sits at the left for the player and the right for the enemy, inside the HUD', () => {
    expect(portraitX(0)).toBe(30);
    expect(portraitX(1)).toBe(HUD_WIDTH - 20 - PORTRAIT);
    expect(portraitX(1) + PORTRAIT).toBeLessThan(HUD_WIDTH);
  });
});

describe('benchPortraitRect', () => {
  it('is square, clears the main bar and sits left of its own bar', () => {
    for (const team of [0, 1]) {
      for (let row = 0; row < 4; row++) {
        const r = benchPortraitRect(team, row);
        const g = benchBar(sideOffset(team), row);
        expect(r.size).toBeGreaterThan(0);
        expect(r.x + r.size).toBeLessThan(g.minX);
        expect(r.y).toBeGreaterThanOrEqual(BENCH_TOP);
        expect(r.y).toBeLessThanOrEqual(Math.max(g.y - r.size / 2, BENCH_TOP));
      }
    }
  });
  it('steps down the rows', () => {
    expect(benchPortraitRect(0, 3).y).toBeGreaterThanOrEqual(benchPortraitRect(0, 0).y);
  });
});

describe('regenAnchor', () => {
  it('goes right of the player bars and left of the enemy bars', () => {
    const g0 = benchBar(sideOffset(0), 1);
    const g1 = benchBar(sideOffset(1), 1);
    expect(regenAnchor(0, g0)).toEqual({ x: g0.maxX + 10, y: g0.y });
    expect(regenAnchor(1, g1)).toEqual({ x: sideOffset(1) + 108, y: g1.y });
  });
  it('keeps the enemy text inside its side', () => {
    expect(regenAnchor(1, mainBar(sideOffset(1))).x).toBeLessThan(HUD_WIDTH);
  });
});

describe('chipRowTop', () => {
  it('uses the minimum when there are no health words', () => {
    expect(chipRowTop(60, undefined)).toBe(60);
    expect(chipRowTop(60, { text: '', y: 200, height: 50 })).toBe(60);
  });
  it('drops below wrapped words, rounding up and leaving 2 px', () => {
    expect(chipRowTop(60, { text: 'Hurt', y: 22, height: 30.2 })).toBe(60);
    expect(chipRowTop(60, { text: 'Hurt', y: 22, height: 60.2 })).toBe(85);
  });
});

describe('comboKey', () => {
  it('changes with the hit count or the whole damage, not with sub-integer damage', () => {
    expect(comboKey(3, 41.2)).toBe(comboKey(3, 40.8));
    expect(comboKey(3, 41)).not.toBe(comboKey(4, 41));
    expect(comboKey(3, 41)).not.toBe(comboKey(3, 42));
    expect(comboKey(0, 0)).toBe(0);
  });
});

describe('barGrain', () => {
  const g = { y: 20, line: 9 };
  it('is a still pattern: the same segments give the same flecks', () => {
    expect(barGrain(g, [[10, 80]])).toEqual(barGrain(g, [[10, 80]]));
    expect(barGrain(g, [[10, 80]]).length).toBeGreaterThan(0);
  });
  it('stays inside the segments and within a line of the bar', () => {
    for (const f of barGrain(g, [[10, 80], [100, 130]])) {
      expect((f.x >= 10 && f.x < 80) || (f.x >= 100 && f.x < 130)).toBe(true);
      expect(Math.abs(f.y - g.y)).toBeLessThanOrEqual(g.line / 3 + 1);
      expect([0x0a0806, 0xcfc4a8]).toContain(f.color);
    }
  });
  it('draws nothing for an empty or reversed segment', () => {
    expect(barGrain(g, [])).toEqual([]);
    expect(barGrain(g, [[50, 50], [60, 40]])).toEqual([]);
  });
});

describe('edgeGrainFlecks', () => {
  const flecks = edgeGrainFlecks();
  it('makes 2600 still flecks inside the 1280x720 frame', () => {
    expect(flecks).toHaveLength(2600);
    expect(edgeGrainFlecks()).toEqual(flecks);
    for (const f of flecks) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThanOrEqual(1280);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeLessThanOrEqual(720);
    }
  });
  it('mixes an ash-brown fleck in every fifth', () => {
    expect(flecks.filter((f) => f.color === 0x4a2a1c)).toHaveLength(520);
  });
  it('is thickest at the edge: more flecks in the outer quarter than the inner half', () => {
    const outer = flecks.filter((f) => f.x < 320 || f.x > 960).length;
    const inner = flecks.filter((f) => f.x >= 320 && f.x <= 960).length;
    expect(outer).toBeGreaterThan(inner);
  });
  it('honours a smaller count', () => {
    expect(edgeGrainFlecks(10)).toEqual(flecks.slice(0, 10));
  });
});
