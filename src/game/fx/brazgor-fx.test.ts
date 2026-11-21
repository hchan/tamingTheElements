import { describe, expect, it } from 'vitest';
import { GORE_TICKS, HIDE_TICKS, forgeGore, moltenHide } from './brazgor-fx';

describe('brazgor fx', () => {
  it('forge gore is drawn while live and gone after its ticks', () => {
    expect(forgeGore(0, 0, 0, 0, false)?.arc.length).toBe(18);
    expect(forgeGore(0, 0, 0, GORE_TICKS + 1, false)).toBeUndefined();
  });
  it('forge gore lands on the side the caster faces', () => {
    expect(forgeGore(0, 0, 0, 5, false)?.impact.x).toBeGreaterThan(0);
    expect(forgeGore(0, 0, 4, 5, false)?.impact.x).toBeLessThan(0);
  });
  it('forge gore shock grows and fades', () => {
    const a = forgeGore(0, 0, 0, 2, false);
    const b = forgeGore(0, 0, 0, 20, false);
    expect(b?.impact.r).toBeGreaterThan(a?.impact.r ?? 0);
    expect(b?.alpha).toBeLessThan(a?.alpha ?? 0);
  });
  it('molten hide glows round the caster then ends', () => {
    expect(moltenHide(0, 0, 10, false)?.embers).toHaveLength(10);
    expect(moltenHide(0, 0, HIDE_TICKS + 1, false)).toBeUndefined();
  });
  it('reduced motion holds still: same shapes at any age', () => {
    expect(forgeGore(5, 5, 1, 1, true)).toEqual(forgeGore(5, 5, 1, 15, true));
    expect(moltenHide(5, 5, 1, true)).toEqual(moltenHide(5, 5, 30, true));
  });
});
