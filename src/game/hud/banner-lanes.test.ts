import { describe, expect, it } from 'vitest';
import { BANNER_KEY, CUT_KEY, LANE_MAX_WAIT_TICKS, LaneWait, bannerDraws, centreBusy, cutUp } from './banner-lanes';

const reg = (o: Record<string, unknown>) => ({ get: (k: string) => o[k] });

describe('banner lanes', () => {
  it('reads the shared registry flags', () => {
    expect(cutUp(reg({}))).toBe(false);
    expect(cutUp(reg({ [CUT_KEY]: true }))).toBe(true);
    expect(centreBusy(reg({}))).toBe(false);
    expect(centreBusy(reg({ [BANNER_KEY]: true }))).toBe(true);
    expect(centreBusy(reg({ [CUT_KEY]: true }))).toBe(true);
  });

  it('hides the banner under the super cut-in and the intro banner behind the result card', () => {
    expect(bannerDraws(false, false, true)).toBe(true);
    expect(bannerDraws(true, false, false)).toBe(false);
    expect(bannerDraws(false, true, true)).toBe(false);
    expect(bannerDraws(false, true, false)).toBe(true);
  });

  it('holds a deferred call only while busy and only up to the cap', () => {
    const w = new LaneWait();
    expect(w.hold(false, 1)).toBe(false);
    expect(w.hold(true, 10)).toBe(true);
    expect(w.hold(true, LANE_MAX_WAIT_TICKS)).toBe(true);
    expect(w.hold(true, 1)).toBe(false);
    w.reset();
    expect(w.hold(true, 1)).toBe(true);
  });
});
