import { describe, expect, it } from 'vitest';
import {
  ArcadeHudModel, CHARGE_DASH, NUMBER_BANNER_ALPHA, NUMBER_FAN, COMBO_HOLD_MS, COMBO_POP_MS, METER_INSET, METER_PULSE_MS, METER_W, METER_Y, NUMBER_MS, NUMBER_RISE_PX, NUMBER_SLOTS,
  SEGMENT_GAP, SEGMENT_H, SEGMENT_W, comboAlpha, comboLabel, comboScale, meterLabel, meterLabelY, meterFlashAlpha, meterSegments, meterX,
  numberAlpha, numberLabel, numberRise, readyGlow, superRimLayers, gapLabel, lifeTicks, projectToHud, clampNumber, clearOfPops, NUMBER_POP_GAP, hudFrame, viewOfCamera,
} from './arcade-hud';
import { dashSegments } from './bars';
import { CHIP_Y, SLIM_BAR_Y, SLIM_LINE_MAX, SLIM_H, chipRect, slimBar } from './slim-hud';
import { PIP_R, pips } from './round-announcer';

describe('readyGlow', () => {
  it('breathes between 0.75 and 1, steady 1 with reduced motion', () => {
    expect(readyGlow(0, true)).toBe(1);
    expect(readyGlow(0, false)).toBeCloseTo(0.75);
    expect(readyGlow(600, false)).toBeCloseTo(1);
  });
});

describe('superRimLayers', () => {
  it('keeps a solid steady edge and scales the halo by the breathe factor', () => {
    expect(superRimLayers(0.75).steady.alpha).toBeGreaterThan(0.9);
    const lo = superRimLayers(0.75).halo;
    const hi = superRimLayers(1).halo;
    expect(lo).toHaveLength(3);
    lo.forEach((l, i) => { expect(l.alpha).toBeCloseTo(0.75 * (hi[i]?.alpha ?? 0)); });
  });
});

describe('damage numbers', () => {
  it('fan wide enough that two-digit numbers on one tick do not touch, and dim under a banner (r17 KO stack)', () => {
    const slots = NUMBER_FAN.slice(0, 3);
    // a 30 px bold two-digit number is about 36 px wide: neighbours in the fan must sit further apart than that
    expect(Math.abs((slots[1]?.[0] ?? 0) - (slots[0]?.[0] ?? 0))).toBeGreaterThan(40);
    expect(Math.abs((slots[2]?.[0] ?? 0) - (slots[0]?.[0] ?? 0))).toBeGreaterThan(40);
    expect(NUMBER_BANNER_ALPHA).toBeLessThan(0.5);
    expect(NUMBER_BANNER_ALPHA).toBeGreaterThan(0);
  });
  it('float up 24 px over 500 ms; reduced motion fades them in place', () => {
    expect([0, NUMBER_MS / 2, NUMBER_MS, NUMBER_MS * 2].map((a) => numberRise(a, false))).toEqual([-0, -12, -24, -24]);
    expect(numberRise(NUMBER_MS, false)).toBe(-NUMBER_RISE_PX);
    expect(numberRise(NUMBER_MS / 2, true)).toBe(0);
    expect([0, NUMBER_MS / 2, NUMBER_MS * 0.75, NUMBER_MS].map(numberAlpha)).toEqual([1, 1, 0.5, 0]);
  });
  it('label whole points (at least 1 for real damage) and say COUNTER in words', () => {
    expect(numberLabel(12.4, false)).toBe('12');
    expect(numberLabel(0.2, false)).toBe('1');
    expect(numberLabel(0, false)).toBe('0');
    expect(numberLabel(30, true)).toBe('30 COUNTER');
  });
  it('are pooled: a fixed set of slots, the oldest reused, expired after 500 ms', () => {
    const m = new ArcadeHudModel();
    for (let i = 0; i < NUMBER_SLOTS + 1; i++) m.spawn(i, 0, i, false, false);
    expect(m.numbers).toHaveLength(NUMBER_SLOTS);
    expect(m.numbers[0]).toMatchObject({ live: true, x: NUMBER_SLOTS, serial: 2 });
    m.update(NUMBER_MS - 1, [0, 0], [0, 0]);
    expect(m.numbers.every((n) => n.live)).toBe(true);
    m.update(1, [0, 0], [0, 0]);
    expect(m.numbers.some((n) => n.live)).toBe(false);
  });
  it('fan out when several land on the same spot', () => {
    const m = new ArcadeHudModel();
    for (let i = 0; i < 3; i++) m.spawn(100, 100, 5, false, false);
    expect(new Set(m.numbers.slice(0, 3).map((n) => `${String(n.x)},${String(n.y)}`)).size).toBe(3);
  });
});

describe('combo counter', () => {
  it('shows from 2 hits on the attacking side, pops at 3, 5 and 8, and holds 1 s after the combo ends', () => {
    const m = new ArcadeHudModel();
    const c = m.combos[0];
    m.update(16, [1, 0], [10, 0]);
    expect(c.hits).toBe(0);
    m.update(16, [2, 0], [20, 0]);
    expect(c).toMatchObject({ hits: 2, damage: 20 });
    expect(comboScale(c, false)).toBe(1);
    m.update(16, [3, 0], [29, 0]);
    expect(comboScale(c, false)).toBeGreaterThan(1);
    expect(comboScale(c, true)).toBe(1);
    m.update(COMBO_POP_MS, [3, 0], [29, 0]);
    expect(comboScale(c, false)).toBe(1);
    expect(m.combos[1].hits).toBe(0);
    m.update(COMBO_HOLD_MS - 300, [0, 0], [0, 0]);
    expect(c.hits).toBe(3);
    expect(comboAlpha(c)).toBe(1);
    m.update(150, [0, 0], [0, 0]);
    expect(comboAlpha(c)).toBeCloseTo(0.5);
    m.update(150, [0, 0], [0, 0]);
    expect(c.hits).toBe(0);
  });
  it('labels hits and rounded damage', () => {
    expect(comboLabel(4, 41.6)).toBe('4 HITS\n42 DMG');
  });
});

describe('hyper meter', () => {
  it('says the bar count as a number, and MAX when full', () => {
    expect([0, 500, 999, 1000, 2999, 3000].map(meterLabel)).toEqual(['0%', '50%', '99%', '1', '2', '3 MAX']);
  });
  it('draws three segments: full ones solid, the filling one dashed (a pattern, not only colour)', () => {
    const segs = meterSegments(1500, 100);
    expect(segs.map((s) => s.x)).toEqual([100, 100 + SEGMENT_W + SEGMENT_GAP, 100 + 2 * (SEGMENT_W + SEGMENT_GAP)]);
    expect(segs.map((s) => [s.fill, s.full])).toEqual([[SEGMENT_W, true], [SEGMENT_W / 2, false], [0, false]]);
    expect(dashSegments(0, SEGMENT_W / 2, CHARGE_DASH).length).toBeGreaterThan(1);
    expect(meterSegments(3000, 0).every((s) => s.full)).toBe(true);
    expect(meterSegments(0, 0).every((s) => s.fill === 0 && !s.full)).toBe(true);
  });
  it('sits toward the centre on both sides, with clear space from the health text and the timer column', () => {
    const inner0 = slimBar(0).maxX;
    const inner1 = slimBar(1).minX;
    expect(meterX(0, inner0)).toBe(inner0 - METER_INSET - METER_W);
    expect(meterX(1, inner1)).toBe(inner1 + METER_INSET);
    // The meter sits in the slim bar's second row: under the life bar, inside the top SLIM_H px.
    expect(METER_Y).toBeGreaterThanOrEqual(slimBar(0).y + slimBar(0).lineMax / 2);
    expect(METER_Y + SEGMENT_H).toBeLessThanOrEqual(SLIM_H);
    // The round pips (the widest part of the centre column) end well before either meter.
    const xs = pips([0, 0]).map((p) => p.x);
    expect(Math.min(...xs) - PIP_R - (meterX(0, inner0) + METER_W)).toBeGreaterThanOrEqual(4);
    expect(meterX(1, inner1) - (Math.max(...xs) + PIP_R)).toBeGreaterThanOrEqual(4);
  });
  it('tracks the sim value; a full meter pulses once a second (steady with reduced motion)', () => {
    const m = new ArcadeHudModel();
    m.update(16, [0, 0], [0, 0], [1200, 3000]);
    expect(m.meters.map((x) => x.value)).toEqual([1200, 3000]);
    expect(meterFlashAlpha(m.meters[0], false)).toBe(1);
    const pulses: number[] = [];
    for (let ms = 0; ms < METER_PULSE_MS * 2; ms += 100) {
      pulses.push(meterFlashAlpha(m.meters[1], false));
      expect(meterFlashAlpha(m.meters[1], true)).toBe(1);
      m.update(100, [0, 0], [0, 0], [1200, 3000]);
    }
    // Dims (one flash) at most twice in 2 s: well under 3 flashes per second.
    const flashes = pulses.filter((a, i) => a < 1 && (pulses[i - 1] ?? 1) === 1).length;
    expect(flashes).toBe(2);
    m.update(16, [0, 0], [0, 0], [1200, 0]);
    expect(m.meters[1]).toMatchObject({ value: 0, full: 0 });
    m.update(16, [0, 0], [0, 0]);
    expect(m.meters.map((x) => x.value)).toEqual([0, 0]);
  });
});

describe('SUPER label vs bench portraits (qa-r12, phone landscape)', () => {
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const floor = SLIM_BAR_Y + SLIM_LINE_MAX / 2;
  const mid = METER_Y + SEGMENT_H / 2;

  it('keeps the label level with the segments when it is small, lifts it when tall, and never crosses the life bar', () => {
    expect(meterLabelY(mid, 14, CHIP_Y, floor)).toBe(mid);
    expect(meterLabelY(mid, 24, CHIP_Y, floor)).toBe(CHIP_Y - 5 - 12);
    expect(meterLabelY(mid, 60, CHIP_Y, floor)).toBe(floor + 30);
  });

  it('the phone-sized label (about 21 px tall) clears the bench portraits and their frames, both sides, every chip', () => {
    const h = 21;
    for (const team of [0, 1]) {
      const inner = team === 0 ? slimBar(0).maxX : slimBar(1).minX;
      const x = meterX(team, inner);
      const y = meterLabelY(mid, h, CHIP_Y, floor);
      const w = 120; // "SUPER 100%" at the boosted size, generous
      const label = { x: team === 0 ? x - 8 - w : x + METER_W + 8, y: y - h / 2, w, h };
      for (let i = 0; i < 2; i++) {
        const c = chipRect(team, i);
        expect(overlap(label, { x: c.x - 2, y: c.y - 2, w: c.size + 4, h: c.size + 4 })).toBe(false);
      }
      expect(label.y).toBeGreaterThanOrEqual(floor);
    }
  });
});

describe('lifeTicks', () => {
  it('draws a notch per 100 HP and none at full', () => {
    expect(lifeTicks(297, 120, 580)).toHaveLength(2);
    expect(lifeTicks(540, 120, 580)).toHaveLength(5);
    expect(lifeTicks(591, 120, 580)).toHaveLength(5);
    expect(lifeTicks(600, 120, 580)).toHaveLength(5);
    expect(lifeTicks(100, 120, 580)).toHaveLength(0);
  });
  it('shows the pool by notches on equal tracks (WP-HF1: 228 HP is 2, 455 HP is 4)', () => {
    expect(lifeTicks(228, 120, 580)).toHaveLength(2);
    expect(lifeTicks(455, 120, 580)).toHaveLength(4);
  });
  it('places notches proportionally from the zero end', () => {
    const t = lifeTicks(400, 0, 400);
    expect(t).toEqual([100, 200, 300]);
  });
  it('doubles the step instead of cluttering', () => {
    const t = lifeTicks(2500, 0, 460);
    expect(t.length).toBeGreaterThan(0);
    expect(t.length).toBeLessThanOrEqual(12);
    const gaps = t.slice(1).map((x, i) => x - (t[i] ?? 0));
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(8);
    // A narrow bar (a phone chip) widens the step on the minimum gap alone.
    expect(lifeTicks(600, 0, 30)).toEqual([10, 20]);
  });
  it('works for a mirrored bar', () => {
    expect(lifeTicks(300, 300, 0)).toEqual([200, 100]);
    expect(lifeTicks(0, 0, 100)).toEqual([]);
  });
});

describe('gapLabel', () => {
  it('names the last hero in the K.O. gap and is blank only when there was none', () => {
    expect(gapLabel({ name: 'Curomo' }, false)).toBe('Curomo  K.O.');
    expect(gapLabel(undefined, false)).toBe('');
    expect(gapLabel({ name: 'Curomo' }, true)).toBe('');
  });
});

describe('projectToHud', () => {
  const to = { x: 0, y: 0, w: 1280, h: 720 };
  it('is the identity for an unpanned, unzoomed view', () => {
    expect(projectToHud(300, 200, to, to, { x: 0, y: 0 })).toEqual({ x: 300, y: 200 });
  });
  it('follows pan and zoom', () => {
    const from = { x: 640, y: 0, w: 1280, h: 720 };
    expect(projectToHud(1280, 360, from, to, { x: 0, y: 0 })).toEqual({ x: 640, y: 360 });
    const wide = { x: 0, y: -180, w: 1920, h: 1080 };
    expect(projectToHud(960, 360, wide, to, { x: 0, y: 0 })).toEqual({ x: 640, y: 360 });
  });
});

describe('clearOfPops', () => {
  const frame = { x: 0, y: 0, w: 1280, h: 720 };
  const out = { x: 0, y: 0 };
  const hits = (x: number, y: number, hw: number, h: number, r: { x: number; y: number; w: number; h: number }): boolean =>
    x + hw > r.x && x - hw < r.x + r.w && y > r.y && y - h < r.y + r.h;
  it('leaves a number alone when nothing touches it', () => {
    expect(clearOfPops(300, 300, 30, 30, frame, [{ x: 900, y: 300, w: 80, h: 40 }], 1, out)).toEqual({ x: 300, y: 300 });
  });
  it('moves off an overlapping pop to the nearer side, with a gap', () => {
    const pop = { x: 280, y: 280, w: 100, h: 40 };
    const r = clearOfPops(300, 310, 30, 30, frame, [pop], 1, out);
    expect(r.x).toBe(280 - NUMBER_POP_GAP - 30);
    expect(hits(r.x, r.y, 30, 30, pop)).toBe(false);
  });
  it('a tie goes toward the frame centre', () => {
    const pop = { x: 570, y: 280, w: 100, h: 40 };
    expect(clearOfPops(620, 310, 30, 30, frame, [pop], 1, out).x).toBeGreaterThan(620);
  });
  it('clears two obstacles in turn', () => {
    const a = { x: 270, y: 280, w: 60, h: 40 };
    const b = { x: 190, y: 280, w: 70, h: 40 };
    const r = clearOfPops(300, 310, 30, 30, frame, [a, b], 2, out);
    expect(hits(r.x, r.y, 30, 30, a)).toBe(false);
    expect(hits(r.x, r.y, 30, 30, b)).toBe(false);
  });
  it('goes above the obstacle when neither side fits in the frame', () => {
    const wall = { x: 0, y: 280, w: 1280, h: 40 };
    const r = clearOfPops(600, 310, 30, 30, frame, [wall], 1, out);
    expect(r.y).toBe(280 - NUMBER_POP_GAP);
  });
  it('honours the count, ignoring obstacles past it', () => {
    expect(clearOfPops(300, 310, 30, 30, frame, [{ x: 280, y: 280, w: 100, h: 40 }], 0, out)).toEqual({ x: 300, y: 310 });
  });
  it('respects a wide frame', () => {
    const wide = { x: -200, y: 0, w: 1680, h: 720 };
    const pop = { x: -150, y: 280, w: 100, h: 40 };
    expect(clearOfPops(-120, 310, 30, 30, wide, [pop], 1, out).x).toBeGreaterThanOrEqual(-200);
  });
});

describe('clampNumber', () => {
  const frame = { x: 0, y: 0, w: 1280, h: 720 };
  it('keeps a number inside the sides, below the HUD band and above the action bar', () => {
    expect(clampNumber(0, 300, 40, 40, frame, []).x).toBe(56);
    expect(clampNumber(1300, 300, 40, 40, frame, []).x).toBe(1280 - 56);
    expect(clampNumber(600, 20, 40, 40, frame, []).y).toBe(160);
    expect(clampNumber(600, 700, 40, 40, frame, []).y).toBe(632);
  });
  it('slides clear of the combo readout towards the centre', () => {
    const combo = { x: 24, y: 110, w: 100, h: 40 };
    const r = clampNumber(100, 150, 40, 40, frame, [combo]);
    expect(r.x - 40).toBeGreaterThanOrEqual(124);
  });
  it('drops under a wide rect instead of sliding far', () => {
    const call = { x: 300, y: 200, w: 360, h: 40 };
    const r = clampNumber(480, 230, 40, 40, frame, [call]);
    expect(r.y - 40).toBeGreaterThanOrEqual(240);
    expect(r.y).toBeLessThanOrEqual(632);
    expect(r.x).toBe(480);
  });
});

describe('clampNumber on a tall frame', () => {
  it('keeps the floor limit 88 px above the frame bottom (632 at 720)', () => {
    expect(clampNumber(600, 3000, 40, 40, { x: 0, y: 0, w: 1280, h: 1944 }, []).y).toBe(1944 - 88);
    expect(clampNumber(600, 700, 40, 40, { x: 0, y: 0, w: 1280, h: 720 }, []).y).toBe(632);
  });
});

describe('hudFrame', () => {
  it('is the plain frame at 1280 and widens about the centre', () => {
    expect(hudFrame(1280)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
    expect(hudFrame(1462)).toEqual({ x: -91, y: 0, w: 1462, h: 720 });
    expect(hudFrame(1280, undefined, 1944)).toEqual({ x: 0, y: 0, w: 1280, h: 1944 });
  });
  it('matches the HUD camera (zoom = res, centred on 640,360)', () => {
    const res = 1.5;
    const w = 1558;
    const cam = { scrollX: 640 - (w * res) / 2, scrollY: 360 - (720 * res) / 2, width: w * res, height: 720 * res, zoom: res };
    const v = viewOfCamera(cam, { x: 0, y: 0, w: 0, h: 0 });
    const f = hudFrame(w);
    expect([v.x, v.y, v.w, v.h].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([f.x, f.y, f.w, f.h]);
  });
  it('projectToHud inverts by swapping the frames', () => {
    const a = { x: 100, y: 50, w: 900, h: 506 };
    const b = hudFrame(1558);
    const p = projectToHud(321, 77, a, b, { x: 0, y: 0 });
    const q = projectToHud(p.x, p.y, b, a, { x: 0, y: 0 });
    expect(q.x).toBeCloseTo(321, 9);
    expect(q.y).toBeCloseTo(77, 9);
  });
});
