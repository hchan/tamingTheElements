import { describe, expect, it } from 'vitest';
import type { Element } from '@core/index';
import { AMBIENT_LAYERS, STAGE_AMBIENT_CAP, STAGE_AMBIENT_DEPTH, STAGE_AMBIENT_MAX_ALPHA, ambientBudget, ambientLayers } from './stage-ambient';

const ELEMENTS: readonly Element[] = ['fire', 'water', 'earth', 'air', 'void'];

describe('stage ambient layers', () => {
  it('every stage element has at least one layer', () => {
    for (const e of ELEMENTS) expect(ambientLayers(e, false).length).toBeGreaterThan(0);
  });

  it('reduced motion (or no element) runs nothing', () => {
    for (const e of ELEMENTS) expect(ambientLayers(e, true)).toEqual([]);
    expect(ambientLayers(undefined, false)).toEqual([]);
  });

  it('stays cheap and subtle: capped particle count, low alpha, behind the fighters', () => {
    for (const e of ELEMENTS) {
      expect(ambientBudget(e)).toBeLessThanOrEqual(STAGE_AMBIENT_CAP);
      for (const l of AMBIENT_LAYERS[e]) expect(l.alpha).toBeLessThanOrEqual(STAGE_AMBIENT_MAX_ALPHA);
    }
    expect(STAGE_AMBIENT_DEPTH).toBeLessThan(0);
  });
});
