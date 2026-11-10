import { describe, expect, it } from 'vitest';
import {
  ArcadeHudModel, COMBO_HOLD_MS, COMBO_POP_MS, NUMBER_MS, NUMBER_RISE_PX, NUMBER_SLOTS, comboAlpha, comboLabel, comboScale,
  numberAlpha, numberLabel, numberRise,
} from './arcade-hud';

describe('damage numbers', () => {
  it('float up 24 px over 500 ms; reduced motion fades them in place', () => {
    expect([0, NUMBER_MS / 2, NUMBER_MS, NUMBER_MS * 2].map((a) => numberRise(a, false))).toEqual([-0, -12, -24, -24]);
    expect(numberRise(NUMBER_MS, false)).toBe(-NUMBER_RISE_PX);
    expect(numberRise(NUMBER_MS / 2, true)).toBe(0);
    expect([0, 250, 375, 500].map(numberAlpha)).toEqual([1, 1, 0.5, 0]);
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
