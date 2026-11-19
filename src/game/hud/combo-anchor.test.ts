import { afterEach, describe, expect, it } from 'vitest';
import {
  COMBO_CLEAR_MS, COMBO_FAN_UP, COMBO_FAN_X, COMBO_GAP, COMBO_POP_MAX, COMBO_STUCK_ALPHA, NUMBER_H_MIN, comboCeil, comboMode, drop, easeTo, lift, newPlaceOut, newPlaceState,
  numberLane, overlapsAny, placeCombo, popCap, slide, victimAnchor, type NumberLane, type PlaceInput, type PlaceState,
} from './combo-anchor';
import { NUMBER_FAN, NUMBER_RISE_PX, NUMBER_TOP, clampNumber, type HudRect } from './arcade-hud';
import { arcadeHeroScale, setHeroBoost } from '../views/hero-scale';
import { POP_NUMBER_CLEAR_PX, popCeil } from '../fx/pop-lanes';
import { clearAbove, dropBelow, easeTo as calloutEase, overlapsAny as calloutOverlapsAny, slideClear } from '../fx/defence-callouts';

const FRAME: HudRect = { x: 0, y: 0, w: 1280, h: 720 };
const WIDE: HudRect = { x: -200, y: 0, w: 1680, h: 720 };

afterEach(() => { setHeroBoost(1); });

/** A small seeded LCG so the parity cases repeat. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('victimAnchor', () => {
  const box = { x: 0, y: 0, w: 0, h: 0 };
  const out = { headX: 0, headY: 0, laneX: 0 };
  it('is the top centre of the drawn (scaled) box, with the lane at the sim centre', () => {
    const k = arcadeHeroScale(80);
    victimAnchor(500, 500, 300, 300, 40, 80, 1, 3000, box, out);
    expect(out.laneX).toBe(520);
    expect(out.headX).toBeCloseTo(520);
    expect(out.headY).toBeCloseTo(300 - 80 * (k - 1));
  });
  it('lerps with framePos', () => {
    victimAnchor(400, 500, 300, 300, 40, 80, 0.5, 3000, box, out);
    expect(out.laneX).toBe(470);
  });
  it('tucks the box in at a wall', () => {
    victimAnchor(0, 0, 300, 300, 40, 80, 1, 3000, box, out);
    expect(out.headX).toBeCloseTo(40 * arcadeHeroScale(80) / 2);
    expect(out.laneX).toBe(20);
  });
  it('follows the hero boost', () => {
    victimAnchor(500, 500, 300, 300, 40, 80, 1, 3000, box, out);
    const a = out.headY;
    setHeroBoost(1.6);
    victimAnchor(500, 500, 300, 300, 40, 80, 1, 3000, box, out);
    expect(out.headY).toBeLessThan(a);
  });
});

describe('numberLane', () => {
  const lane: NumberLane = { x: 0, y: 0, w: 0, h: 0 };
  it('derives the fan from NUMBER_FAN', () => {
    expect(COMBO_FAN_X).toBe(Math.max(...NUMBER_FAN.map((f) => Math.abs(f[0]))));
    expect(COMBO_FAN_UP).toBe(Math.max(...NUMBER_FAN.map((f) => Math.abs(f[1]))));
    expect(COMBO_FAN_X).toBe(46);
    expect(COMBO_FAN_UP).toBe(30);
  });
  it('spans the fan and rise over the head, at s = 1, 1.8 and 2.6', () => {
    for (const s of [1, 1.8, 2.6]) {
      numberLane(600, 400, s, NUMBER_H_MIN, lane);
      expect(lane.w).toBeCloseTo(2 * (46 * s + 35));
      expect(lane.x + lane.w / 2).toBeCloseTo(600);
      expect(lane.y).toBeCloseTo(400 - (30 * s + NUMBER_RISE_PX + NUMBER_H_MIN));
      expect(lane.y + lane.h).toBe(400);
    }
  });
  it('never rises above the HUD band and keeps the number height floor', () => {
    numberLane(600, 130, 2, 38, lane);
    expect(lane.y).toBe(NUMBER_TOP);
    expect(lane.y + lane.h).toBe(NUMBER_TOP + 38);
  });
  it('pins one number plus its rise plus a gap to the pop clearance', () => {
    expect(NUMBER_H_MIN + NUMBER_RISE_PX + 4).toBe(POP_NUMBER_CLEAR_PX);
  });
});

describe('comboCeil', () => {
  const rects: HudRect[] = [{ x: 0, y: 100, w: 100, h: 30 }, { x: 500, y: 100, w: 100, h: 50 }];
  it('is the floor with nothing over the span and under any rect it passes behind', () => {
    expect(comboCeil(rects, 2, 200, 300)).toBe(NUMBER_TOP);
    expect(comboCeil(rects, 2, 50, 150)).toBe(134);
    expect(comboCeil(rects, 2, 550, 700)).toBe(154);
    expect(comboCeil(rects, 1, 550, 700)).toBe(NUMBER_TOP);
  });
  it('matches popCeil on random rects', () => {
    const r = lcg(3);
    for (let n = 0; n < 200; n++) {
      const list: HudRect[] = [];
      for (let i = 0; i < 5; i++) list.push({ x: r() * 1200, y: r() * 150, w: 20 + r() * 100, h: 10 + r() * 40 });
      const x0 = r() * 1100;
      const x1 = x0 + r() * 150;
      expect(comboCeil(list, list.length, x0, x1, 102, 4)).toBe(popCeil([list], x0, x1));
    }
  });
});

describe('helper parity with defence-callouts', () => {
  it('overlap, lift, slide, drop and ease give the same answers', () => {
    const r = lcg(11);
    for (let n = 0; n < 300; n++) {
      const rects: HudRect[] = [];
      for (let i = 0; i < 1 + Math.floor(r() * 4); i++) rects.push({ x: r() * 1100, y: 120 + r() * 400, w: 30 + r() * 150, h: 20 + r() * 80 });
      const cx = 100 + r() * 1000;
      const b = 150 + r() * 400;
      const halfW = 30 + r() * 50;
      const h = 40 + r() * 40;
      expect(overlapsAny(cx, b, halfW, h, rects, rects.length, 8)).toBe(calloutOverlapsAny(cx, b, halfW, h, rects, 8));
      expect(lift(cx, b, halfW, h, rects, rects.length, 8)).toBe(clearAbove(cx, b, halfW, h, rects, 8));
      expect(slide(cx, b, halfW, h, rects, rects.length, 8, 16, 1264, 200, 640, cx)).toBe(slideClear(cx, b, halfW, h, rects, 8, 16, 1264, 200, 640, cx));
      expect(drop(cx, b, halfW, h, rects, rects.length, 8, b + 50)).toBe(dropBelow(cx, b, halfW, h, rects, 8, b + 50));
      expect(easeTo(0, 40, 16, false)).toBe(calloutEase(0, 40, 16, false));
      expect(easeTo(0, 0.3, 16, false)).toBe(calloutEase(0, 0.3, 16, false));
      expect(easeTo(5, 40, 16, true)).toBe(calloutEase(5, 40, 16, true));
    }
  });
  it('honours count over the array length', () => {
    const rects: HudRect[] = [{ x: 0, y: 0, w: 1000, h: 1000 }];
    expect(overlapsAny(500, 500, 10, 10, rects, 0, 8)).toBe(false);
  });
});

describe('comboMode', () => {
  it('is anchored only on a fine-pointer desktop with an anchor', () => {
    for (const phone of [false, true]) for (const coarse of [false, true]) for (const anchored of [false, true]) {
      expect(comboMode(phone, coarse, anchored)).toBe(!phone && !coarse && anchored ? 'anchored' : 'band');
    }
  });
});

describe('popCap', () => {
  it('is capped to the pop scale, floored at 1, and limited by the ceiling and the sides', () => {
    expect(popCap(640, 300, 50, 50, 120, FRAME)).toBe(COMBO_POP_MAX);
    expect(popCap(640, 150, 50, 50, 120, FRAME)).toBe(1);
    expect(popCap(80, 300, 50, 50, 120, FRAME)).toBeCloseTo(1.28);
    expect(popCap(1200, 300, 50, 50, 120, FRAME)).toBeCloseTo(1.28);
    expect(popCap(30, 300, 50, 50, 120, FRAME)).toBe(1);
  });
});

describe('placeCombo', () => {
  const W = 120;
  const H = 60;
  const base = (over: Partial<PlaceInput> = {}): PlaceInput => ({
    headX: 640, b0: 300, w: W, h: H, frame: FRAME, ceilRects: [], ceilCount: 0, obstacles: [], count: 0, fresh: true, reduced: false, dtMs: 16, ...over,
  });
  const lane: HudRect = { x: 560, y: 308, w: 160, h: 100 };
  const run = (st: PlaceState, i: PlaceInput) => placeCombo(st, i, lane, newPlaceOut());

  it('sits at the natural spot when nothing is in the way', () => {
    const o = run(newPlaceState(), base());
    expect(o.x).toBe(640);
    expect(o.y).toBe(300);
    expect(o.stuck).toBe(false);
    expect(o.settled).toBe(true);
  });
  it('lifts above an obstacle, with a gap', () => {
    const rect: HudRect = { x: 600, y: 270, w: 80, h: 40 };
    const o = run(newPlaceState(), base({ obstacles: [rect], count: 1 }));
    expect(o.targetY).toBe(270 - COMBO_GAP);
    expect(o.targetX).toBe(640);
  });
  it('slides beside an obstacle when lifting would hit the ceiling, toward the centre on a tie', () => {
    const rect: HudRect = { x: 600, y: 120, w: 80, h: 200 };
    const o = run(newPlaceState(), base({ obstacles: [rect], count: 1, b0: 320 }));
    expect(o.stuck).toBe(false);
    expect(Math.abs(o.targetX - 640)).toBeGreaterThan(0);
    expect(overlapsAny(o.targetX, o.targetY, W / 2, H, [rect], 1, COMBO_GAP - 0.01)).toBe(false);
  });
  it('is stuck, at the natural spot and capped alpha, when nothing fits', () => {
    const wall: HudRect = { x: -500, y: 0, w: 2400, h: 800 };
    const o = run(newPlaceState(), base({ obstacles: [wall], count: 1 }));
    expect(o.stuck).toBe(true);
    expect(o.targetX).toBe(640);
    expect(COMBO_STUCK_ALPHA).toBe(0.4);
  });
  it('keeps the counter under the ceiling', () => {
    const chip: HudRect = { x: 500, y: 100, w: 300, h: 60 };
    const o = run(newPlaceState(), base({ b0: 170, ceilRects: [chip], ceilCount: 1 }));
    expect(o.y - H).toBeGreaterThanOrEqual(164 - 1e-6);
    expect(o.ceil).toBe(164);
  });
  it('clamps to the frame at both walls, and in a wide frame', () => {
    const left = run(newPlaceState(), base({ headX: 10 }));
    expect(left.x).toBe(16 + W / 2);
    const right = run(newPlaceState(), base({ headX: 1275 }));
    expect(right.x).toBe(1280 - 16 - W / 2);
    const wide = run(newPlaceState(), base({ headX: -190, frame: WIDE }));
    expect(wide.x).toBe(-200 + 16 + W / 2);
    // Same maths as a damage number with no rects.
    expect(left.x).toBe(clampNumber(10, 300, W / 2, H, FRAME, []).x);
  });
  it('eases toward a new target and reports settled only at the end', () => {
    const st = newPlaceState();
    run(st, base());
    const rect: HudRect = { x: 600, y: 270, w: 80, h: 40 };
    let o = run(st, base({ obstacles: [rect], count: 1, fresh: false }));
    expect(o.settled).toBe(false);
    expect(o.y).toBeLessThan(300);
    expect(o.y).toBeGreaterThan(o.targetY);
    for (let n = 0; n < 40 && !o.settled; n++) o = run(st, base({ obstacles: [rect], count: 1, fresh: false }));
    expect(o.settled).toBe(true);
    expect(o.y).toBeCloseTo(o.targetY, 0);
  });
  it('jumps when fresh and under reduced motion', () => {
    const rect: HudRect = { x: 600, y: 270, w: 80, h: 40 };
    const st = newPlaceState();
    run(st, base());
    const o = run(st, base({ obstacles: [rect], count: 1, fresh: false, reduced: true }));
    expect(o.settled).toBe(true);
    expect(o.y).toBe(262);
  });
  it('waits for the natural spot to stay clear before going back', () => {
    const rect: HudRect = { x: 600, y: 270, w: 80, h: 40 };
    const st = newPlaceState();
    run(st, base({ obstacles: [rect], count: 1 }));
    let o = run(st, base({ fresh: false, dtMs: 16 }));
    expect(o.targetY).toBe(262);
    o = run(st, base({ fresh: false, dtMs: COMBO_CLEAR_MS }));
    expect(o.targetY).toBe(300);
  });
  it('keeps the last offsets while they are still valid', () => {
    const rect: HudRect = { x: 600, y: 270, w: 80, h: 40 };
    const st = newPlaceState();
    run(st, base({ obstacles: [rect], count: 1 }));
    const o = run(st, base({ obstacles: [rect], count: 1, fresh: false }));
    expect(o.targetY).toBe(262);
  });
  it('limits the pop cap near the ceiling', () => {
    const o = run(newPlaceState(), base({ b0: 190 }));
    expect(o.popMax).toBeGreaterThanOrEqual(1);
    expect(o.popMax).toBeLessThanOrEqual(COMBO_POP_MAX);
    expect(o.popMax).toBeCloseTo(Math.max(1, Math.min(COMBO_POP_MAX, (190 - 120) / H)));
  });
});
