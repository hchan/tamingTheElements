import { describe, expect, it } from 'vitest';
import { DEAD_PER_MIN, OVERUSED_SHARE, RARE_PER_MIN, SLOTS, emptyUsage, judge, measure, report, type SlotUsage } from '../../tools/sim/ability-usage';
import { RACES } from '../../tools/sim/run-match';

const slot = (over: Partial<SlotUsage>): SlotUsage => ({ race: 'x', slot: 0, ability: 'a', kind: 'range', matches: 1, ticks: 3000, casts: 0, activeTicks: 0, hits: 0, damage: 0, ...over });

describe('ability usage verdicts', () => {
  it('calls a never-cast slot dead and a slow one rare', () => {
    const [dead, rare] = judge([slot({ casts: 0 }), slot({ slot: 1, casts: 1 })]);
    expect(dead?.verdict).toBe('dead');
    expect(rare?.verdict).toBe('rare');
  });

  it('flags a slot that takes most of the hero casts as overused, and keeps a balanced kit ok', () => {
    const [a, b] = judge([slot({ casts: 60 }), slot({ slot: 1, casts: 1 })]);
    expect(a?.castShare).toBeGreaterThan(OVERUSED_SHARE);
    expect(a?.verdict).toBe('overused');
    expect(b?.verdict).toBe('rare');
    const [c, d] = judge([slot({ casts: 30 }), slot({ slot: 1, casts: 20 })]);
    expect([c?.verdict, d?.verdict]).toEqual(['ok', 'ok']);
  });

  it('computes rates per fighter-minute, uptime and hits per cast', () => {
    const [r] = judge([slot({ ticks: 6000, casts: 10, activeTicks: 1500, hits: 5 })]);
    expect(r?.castsPerMinute).toBeCloseTo(5);
    expect(r?.uptime).toBeCloseTo(0.25);
    expect(r?.hitsPerCast).toBeCloseTo(0.5);
    expect(DEAD_PER_MIN).toBeLessThan(RARE_PER_MIN);
  });

  it('lists every playable race with its two slots', () => {
    const u = emptyUsage();
    expect([...u.keys()]).toEqual([...RACES]);
    for (const rows of u.values()) expect(rows).toHaveLength(SLOTS);
  });
});

describe('ability usage measurement', () => {
  it('counts casts and hits from a real Arcade run, deterministically, without touching the sim', () => {
    const run = (): ReturnType<typeof report> => report(measure('arcade', 1, 1, 3));
    const a = run();
    expect(a.rows).toHaveLength(RACES.length * SLOTS);
    // One seed, all pairings: every hero plays one match against each other hero.
    expect(a.rows.every((r) => r.matches === RACES.length - 1)).toBe(true);
    expect(a.rows.reduce((n, r) => n + r.casts, 0)).toBeGreaterThan(0);
    expect(a.rows.reduce((n, r) => n + r.hits, 0)).toBeGreaterThan(0);
    expect(run().rows.map((r) => r.casts)).toEqual(a.rows.map((r) => r.casts));
  }, 120_000);
});
