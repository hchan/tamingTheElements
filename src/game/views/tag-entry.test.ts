import { describe, expect, it } from 'vitest';
import { PoseKind, applyPose, easeOutCubic, resetPose, type Pose } from './pose-math';
import { TAG_IN_BODY_PX, TAG_IN_DROP_PX, TAG_IN_MAX_SCALE, TAG_IN_SLIDE_PX, tagEntryDir, tagEntryDrop, tagEntryOf, tagEntryPower, tagEntrySlide } from './tag-entry';

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

  // qa-r125 left wall: at x 20 with the foe about 100 px away the 120 px slide left the incoming sprite (wider than its sim box) on the foe.
  it('a foe in contact lengthens the slide so the sprite clears it; a far foe keeps the base slide', () => {
    const have = [1, 1, 0];
    const near = tagEntryPower(2, 0, 0, [0, 1, 0], have, [20, 122, 0]);
    expect(near).toBeGreaterThan(1);
    expect(near).toBeLessThanOrEqual(TAG_IN_MAX_SCALE);
    expect(TAG_IN_SLIDE_PX * near + 100).toBeGreaterThanOrEqual(TAG_IN_BODY_PX); // gap 102 + slide covers the body width
    expect(tagEntryPower(2, 0, 0, [0, 1, 0], have, [20, 900, 0])).toBe(1);
    expect(tagEntryPower(2, -1, 0, [0, 1, 0], have, [20, 122, 0])).toBe(1); // no outgoing position: base slide
  });

  it('applyPose scales the tag-in slide by the power (left wall, foe in contact)', () => {
    const power = tagEntryPower(2, 0, 0, [0, 1, 0], [1, 1, 0], [20, 122, 0]);
    const base: Pose = resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
    const long: Pose = resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
    applyPose(base, PoseKind.tagIn, 0, 1, 1, false);
    applyPose(long, PoseKind.tagIn, 0, 1, power, false);
    expect(long.ox).toBeLessThan(base.ox - 30);
  });

  it('at a wall the hero drops in from above instead of sliding out of the arena', () => {
    const ev = { to: 2, from: 0, team: 0 };
    const left = tagEntryOf(ev, 3, [0, 1, 0], [1, 1, 0], [20, 122, 0]);
    expect(left[0]).toBe(0);
    const right = tagEntryOf(ev, 3, [0, 1, 0], [1, 1, 0], [1850, 1700, 0]);
    expect(right[0]).toBe(0);
    expect(tagEntryOf(ev, 3, [0, 1, 0], [1, 1, 0], [800, 1000, 0])[0]).toBe(1); // mid arena: the usual sideways slide
    const p: Pose = resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
    applyPose(p, PoseKind.tagIn, 0, 0, 1, false);
    expect(p.ox).toBeCloseTo(0);
    expect(p.oy).toBeLessThan(-40);
  });

  // qa-r125 left wall: the old 90 px drop left the sprite half on the foe; it now starts a body height above.
  it('a wall entry starts a body height above rest and lands at 0', () => {
    expect(tagEntryDrop(0)).toBe(TAG_IN_DROP_PX);
    expect(TAG_IN_DROP_PX).toBeGreaterThanOrEqual(240);
    expect(tagEntryDrop(1)).toBe(0);
    const p: Pose = resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
    applyPose(p, PoseKind.tagIn, 0, 0, 1, false);
    expect(p.oy).toBeLessThanOrEqual(-TAG_IN_DROP_PX);
  });
});
