import { describe, expect, it } from 'vitest';
import { DEFAULT_SPARK_STYLE, KO_PUNCH_MS, KO_PUNCH_ZOOM, SPARK_STYLE, koPunchZoom, sparkStyleFor, KO_WASH_MS, KO_WASH_PEAK, koWashStrength, KO_SPLIT_MS, KO_SPLIT_PEAK, koSplitAmount, RING_MS, ringFrame, ringReach, SUPER_FLASH_MS, SUPER_FLASH_PEAK, SUPER_FRACTION_FALLBACK, SUPER_NUMBER_MS, lifeFraction, superFlashAlpha, superNumberFrame, superNumberSize, STREAKS_BY_STRENGTH, STREAK_MS, streakFrame, RECOIL_TICKS, NO_RECOIL, CORE_MS, coreFrame, POP_MS, popFrame, popSize, recoilPose, POSE_HOLD_MS, SHAKE_BOOST, poseHoldMs, shakeBoost, LUNGE_TICKS, lungeOffset, popMerges, tintTowardsWhite } from './hit-feel';

describe('sparkStyleFor', () => {
  it('has a distinct style per element and a default', () => {
    expect(sparkStyleFor('fire').drift).toBeLessThan(0);
    expect(sparkStyleFor('water').drift).toBeGreaterThan(0);
    expect(sparkStyleFor('air').reach).toBeGreaterThan(sparkStyleFor('earth').reach);
    expect(sparkStyleFor(undefined)).toBe(DEFAULT_SPARK_STYLE);
    for (const s of Object.values(SPARK_STYLE)) expect(s.lifeMs).toBeLessThanOrEqual(400);
  });
});

describe('koPunchZoom', () => {
  it('is 1 outside the window, peaks mid-way, and never zooms under reduced motion', () => {
    expect(koPunchZoom(0, false)).toBe(1);
    expect(koPunchZoom(KO_PUNCH_MS, false)).toBe(1);
    expect(koPunchZoom(Number.NaN, false)).toBe(1);
    expect(koPunchZoom(KO_PUNCH_MS / 2, false)).toBeCloseTo(KO_PUNCH_ZOOM, 6);
    expect(koPunchZoom(KO_PUNCH_MS / 2, true)).toBe(1);
  });
});

describe('koWashStrength', () => {
  it('is off outside the window and when reduced, drains fast to the peak, then eases back', () => {
    expect(koWashStrength(0, false)).toBe(0);
    expect(koWashStrength(KO_WASH_MS, false)).toBe(0);
    expect(koWashStrength(Number.NaN, false)).toBe(0);
    expect(koWashStrength(300, true)).toBe(0);
    expect(koWashStrength(120, false)).toBeCloseTo(KO_WASH_PEAK, 6);
    expect(koWashStrength(500, false)).toBeLessThan(KO_WASH_PEAK);
    expect(koWashStrength(500, false)).toBeGreaterThan(koWashStrength(900, false));
  });
});

describe('ringFrame', () => {
  it('grows and fades over RING_MS, then ends; a KO ring reaches further than a heavy one', () => {
    expect(ringFrame(-1, 2)).toBeNull();
    expect(ringFrame(RING_MS, 2)).toBeNull();
    const a = ringFrame(100, 2);
    const b = ringFrame(300, 2);
    expect(a && b && b.radius > a.radius && b.alpha < a.alpha && b.width < a.width).toBe(true);
    expect(ringReach(4)).toBeGreaterThan(ringReach(3));
    expect(ringReach(3)).toBeGreaterThan(ringReach(2));
  });
});

describe('super hit impact rules', () => {
  it('lifeFraction clamps and falls back without a usable max', () => {
    expect(lifeFraction(120, 400)).toBeCloseTo(0.3, 6);
    expect(lifeFraction(900, 400)).toBe(1);
    expect(lifeFraction(-5, 400)).toBe(0);
    expect(lifeFraction(120, undefined)).toBe(SUPER_FRACTION_FALLBACK);
    expect(lifeFraction(120, 0)).toBe(SUPER_FRACTION_FALLBACK);
    expect(lifeFraction(Number.NaN, 400)).toBe(SUPER_FRACTION_FALLBACK);
  });

  it('superNumberSize grows with the life share and caps', () => {
    expect(superNumberSize(0)).toBe(44);
    expect(superNumberSize(0.15)).toBe(68);
    expect(superNumberSize(0.3)).toBe(92);
    expect(superNumberSize(0.9)).toBe(92);
    expect(superNumberSize(Number.NaN)).toBe(44);
  });

  it('superNumberFrame pops, rises and fades; reduced motion holds still; null once done', () => {
    expect(superNumberFrame(-1, false)).toBeNull();
    expect(superNumberFrame(SUPER_NUMBER_MS, false)).toBeNull();
    expect(superNumberFrame(70, false)?.scale).toBeGreaterThan(1.3);
    expect(superNumberFrame(400, false)?.scale).toBe(1);
    const a = superNumberFrame(300, false);
    const b = superNumberFrame(800, false);
    expect(a && b && b.rise > a.rise && b.alpha < a.alpha).toBe(true);
    const r = superNumberFrame(300, true);
    expect(r).toEqual({ scale: 1, rise: 0, alpha: 1 });
    expect(superNumberFrame(800, true)?.rise).toBe(0);
  });

  it('superFlashAlpha peaks at once and ends within SUPER_FLASH_MS', () => {
    expect(superFlashAlpha(0)).toBe(SUPER_FLASH_PEAK);
    expect(superFlashAlpha(SUPER_FLASH_MS / 2)).toBeCloseTo(SUPER_FLASH_PEAK / 2, 6);
    expect(superFlashAlpha(SUPER_FLASH_MS)).toBe(0);
    expect(superFlashAlpha(-1)).toBe(0);
  });
});

describe('koSplitAmount', () => {
  it('is zero outside the window, for NaN and under reduced motion', () => {
    expect(koSplitAmount(0, false)).toBe(0);
    expect(koSplitAmount(KO_SPLIT_MS, false)).toBe(0);
    expect(koSplitAmount(Number.NaN, false)).toBe(0);
    expect(koSplitAmount(40, true)).toBe(0);
  });
  it('rises fast to a subtle peak, then eases back', () => {
    expect(koSplitAmount(40, false)).toBeCloseTo(KO_SPLIT_PEAK, 9);
    expect(KO_SPLIT_PEAK).toBeLessThanOrEqual(0.005);
    expect(koSplitAmount(100, false)).toBeLessThan(KO_SPLIT_PEAK);
    expect(koSplitAmount(100, false)).toBeGreaterThan(koSplitAmount(200, false));
    expect(KO_SPLIT_MS).toBeLessThanOrEqual(300);
  });
});

describe('plain-hit weight (QA r34)', () => {
  it('throws more and longer streaks as the hit gets heavier, and ends on time', () => {
    expect([...STREAKS_BY_STRENGTH]).toEqual([...STREAKS_BY_STRENGTH].sort((a, b) => a - b));
    const reach = (s: number): number => streakFrame(STREAK_MS * 0.5, s, 1)?.to ?? 0;
    expect(reach(1)).toBeGreaterThan(reach(0));
    expect(reach(3)).toBeGreaterThan(reach(2));
    expect(streakFrame(0, 0, 0)?.alpha).toBe(1);
    expect(streakFrame(STREAK_MS, 0, 0)).toBeNull();
    expect(streakFrame(-1, 0, 0)).toBeNull();
    const f = streakFrame(STREAK_MS * 0.7, 2, 0.5);
    expect(f?.from).toBeLessThanOrEqual(f?.to ?? 0);
  });
  it('squashes and shoves the victim along the blow, scaled by strength, then settles', () => {
    const peak = (s: number): ReturnType<typeof recoilPose> => recoilPose(RECOIL_TICKS * 0.2, s, 1, false);
    expect(peak(3).sx).toBeLessThan(peak(0).sx);
    expect(peak(3).dx).toBeGreaterThan(peak(0).dx);
    expect(peak(0).sx).toBeLessThan(1);
    expect(peak(0).sy).toBeGreaterThan(1);
    expect(recoilPose(RECOIL_TICKS * 0.2, 1, -1, false).dx).toBeLessThan(0);
    expect(recoilPose(RECOIL_TICKS, 3, 1, false)).toBe(NO_RECOIL);
    expect(recoilPose(RECOIL_TICKS * 0.95, 3, 1, false).sx).toBeGreaterThan(0.99);
  });
  it('is still under reduced motion and for bad input', () => {
    expect(recoilPose(2, 3, 1, true)).toBe(NO_RECOIL);
    expect(recoilPose(Number.NaN, 3, 1, false)).toBe(NO_RECOIL);
    expect(recoilPose(-1, 3, 1, false)).toBe(NO_RECOIL);
  });
});

describe('render-side hit-stop (QA r35)', () => {
  it('holds a visible 70-120 ms (QA r38), longer for harder hits, and nothing under reduced motion', () => {
    for (const ms of POSE_HOLD_MS) {
      expect(ms).toBeGreaterThanOrEqual(70);
      expect(ms).toBeLessThanOrEqual(120);
    }
    expect(poseHoldMs(0, false)).toBeLessThan(poseHoldMs(3, false));
    expect(poseHoldMs(2, true)).toBe(0);
    expect(poseHoldMs(Number.NaN, false)).toBe(0);
    expect(poseHoldMs(9, false)).toBe(POSE_HOLD_MS[3]);
  });
  it('boosts light shakes more than heavy ones and never shrinks one', () => {
    for (const b of SHAKE_BOOST) expect(b).toBeGreaterThanOrEqual(1);
    expect(shakeBoost(0)).toBeGreaterThan(shakeBoost(2));
    expect(shakeBoost(Number.NaN)).toBe(1);
  });
});

describe('hit weight (QA r38)', () => {
  it('recoil snaps to full on the first tick', () => {
    const p = recoilPose(0, 2, 1, false);
    expect(p.dx).toBeGreaterThan(10);
    expect(p.sx).toBeLessThan(0.75);
    expect(recoilPose(0, 2, 1, true)).toBe(NO_RECOIL);
  });
  it('the contact core starts full, shrinks and ends, bigger for harder hits', () => {
    const a = coreFrame(0, 0);
    const b = coreFrame(0, 3);
    expect(a?.alpha).toBe(1);
    expect(b?.radius ?? 0).toBeGreaterThan(a?.radius ?? 0);
    expect(coreFrame(CORE_MS / 2, 1)?.radius ?? 0).toBeLessThan(coreFrame(0, 1)?.radius ?? 0);
    expect(coreFrame(CORE_MS, 1)).toBeNull();
    expect(coreFrame(-1, 1)).toBeNull();
  });
  it('the damage pop starts large, settles to 1x, fades and ends', () => {
    expect(popFrame(0)?.scale).toBeCloseTo(1.6);
    expect(popFrame(120)?.scale).toBeCloseTo(1, 1);
    expect(popFrame(POP_MS - 1)?.alpha ?? 1).toBeLessThan(0.1);
    expect(popFrame(POP_MS)).toBeNull();
    expect(popSize(0)).toBeGreaterThanOrEqual(38);
    expect(popSize(3)).toBe(0);
    expect(popSize(Number.NaN)).toBe(0);
  });
  it('the attacker lunge steps towards the foe, eases back, flips with direction and is off when reduced', () => {
    expect(lungeOffset(0, 0, 1, false)).toBeGreaterThanOrEqual(4);
    expect(lungeOffset(0, 0, -1, false)).toBeLessThanOrEqual(-4);
    expect(lungeOffset(LUNGE_TICKS - 1, 1, 1, false)).toBeLessThan(lungeOffset(0, 1, 1, false));
    expect(lungeOffset(LUNGE_TICKS, 1, 1, false)).toBe(0);
    expect(lungeOffset(0, 3, 1, false)).toBeGreaterThan(lungeOffset(0, 0, 1, false));
    expect(lungeOffset(0, 2, 1, true)).toBe(0);
  });
  it('pops merge only when close in time and space; the core tint keeps hue towards white', () => {
    expect(popMerges(100, 20, 10)).toBe(true);
    expect(popMerges(600, 20, 10)).toBe(false);
    expect(popMerges(100, 300, 0)).toBe(false);
    expect(tintTowardsWhite(0xff0000, 0)).toBe(0xff0000);
    expect(tintTowardsWhite(0xff0000, 1)).toBe(0xffffff);
    expect(tintTowardsWhite(0xff0000, 0.5)).toBe(0xff8080);
  });
});
