import { describe, expect, it } from 'vitest';
import { PoseKind, applyPose, easeOutCubic, resetPose, type Pose } from './pose-math';
import { TAG_IN_SLIDE_PX, tagEntryDir, tagEntrySlide } from './tag-entry';

const HERO_W = 100;

describe('tag-entry', () => {
  // Slot 0 is the outgoing hero (position source), slot 1 the foe, slot 2 the incoming hero (benched: have 0).
  it('starts on the side away from the foe, using the outgoing hero position (incoming hero is benched)', () => {
    const have = [1, 1, 0];
    expect(tagEntryDir(2, 0, 0, [0, 1, 0], have, [100, 300, 0])).toBe(1); // left of foe: enter from the left
    expect(tagEntryDir(2, 0, 0, [0, 1, 0], have, [500, 300, 0])).toBe(-1); // pushed past the foe: enter from the right
    expect(tagEntryDir(2, 0, 1, [1, 0, 1], have, [100, 300, 0])).toBe(1);
    expect(tagEntryDir(2, 0, 1, [1, 0, 1], have, [500, 300, 0])).toBe(-1);
  });

  it('falls back to the team side without a known outgoing hero or foe', () => {
    expect(tagEntryDir(2, -1, 0, [0, 1, 0], [1, 1, 0], [100, 300, 0])).toBe(1);
    expect(tagEntryDir(2, 0, 1, [1, 0, 1], [1, 0, 0], [100, 300, 0])).toBe(-1);
    expect(tagEntryDir(2, 0, 0, [0, 0, 0], [1, 1, 0], [100, 300, 0])).toBe(1);
  });

  it('slides at least a hero body width at t=0, holds the gap early and ends at 0', () => {
    expect(tagEntrySlide(0)).toBeGreaterThanOrEqual(HERO_W);
    expect(tagEntrySlide(0)).toBe(TAG_IN_SLIDE_PX);
    expect(tagEntrySlide(1)).toBe(0);
    expect(tagEntrySlide(0.25)).toBeGreaterThan((1 - easeOutCubic(0.25)) * TAG_IN_SLIDE_PX);
  });

  it('the incoming box and the foe box do not overlap at t=0 when they stood in contact', () => {
    const foeLeft = 300;
    const toLeft = foeLeft - HERO_W + 20; // overlapping by 20 px at rest (contact)
    const dir = tagEntryDir(2, 0, 0, [0, 1, 0], [1, 1, 0], [toLeft, foeLeft, 0]);
    const p: Pose = resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
    applyPose(p, PoseKind.tagIn, 0, dir, 1, false);
    expect(toLeft + p.ox + HERO_W).toBeLessThanOrEqual(foeLeft);
  });
});
