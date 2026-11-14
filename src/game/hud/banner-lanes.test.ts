import { describe, expect, it } from 'vitest';
import { BANNER_KEY, CUT_KEY, BANNER_WAIT_TICKS, LANE_MAX_WAIT_TICKS, LaneWait, bannerDraws, centreBusy, cutUp, introClockStart } from './banner-lanes';

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
    expect(bannerDraws(false, true, false, true)).toBe(false); // the phone card hides the K.O. banner
    expect(bannerDraws(false, true, false, false)).toBe(true);
    expect(bannerDraws(false, false, false, true)).toBe(true);
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

  it('caps a banner-only wait short, so a tag during FIGHT! is not late', () => {
    const w = new LaneWait();
    expect(w.hold(true, BANNER_WAIT_TICKS - 1, BANNER_WAIT_TICKS)).toBe(true);
    expect(w.hold(true, 5, BANNER_WAIT_TICKS)).toBe(true);
    expect(w.hold(true, 1, BANNER_WAIT_TICKS)).toBe(false);
    expect(BANNER_WAIT_TICKS).toBeLessThan(LANE_MAX_WAIT_TICKS);
  });

  it('starts an intro banner clock when the result card ends', () => {
    expect(introClockStart(60, 100)).toBe(100);
    expect(introClockStart(60, -1)).toBe(60);
    expect(introClockStart(130, 100)).toBe(130);
  });
});
