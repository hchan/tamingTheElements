import { describe, expect, it } from 'vitest';
import {
  ArcadeHudModel, CHARGE_DASH, COMBO_HOLD_MS, COMBO_POP_MS, METER_INSET, METER_PULSE_MS, METER_W, METER_Y, NUMBER_MS, NUMBER_RISE_PX, NUMBER_SLOTS,
  SEGMENT_GAP, SEGMENT_H, SEGMENT_W, comboAlpha, comboLabel, comboScale, meterLabel, meterLabelY, meterFlashAlpha, meterSegments, meterX,
  numberAlpha, numberLabel, numberRise,
} from './arcade-hud';
import { dashSegments } from './bars';
import { CHIP_Y, SLIM_BAR_Y, SLIM_LINE_MAX, SLIM_H, chipRect, slimBar } from './slim-hud';
import { PIP_R, pips } from './round-announcer';

describe('damage numbers', () => {
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
