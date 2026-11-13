import { describe, expect, it } from 'vitest';
import type { RenderActionBar } from '@core/index';
import { buildSlots } from './action-bar';
import { groupOf, groupSlots, wantsGroupedBar } from './bar-groups';

const slot = { sprite: 'x', readyTick: 0, cooldownTicks: 10 };
const bar: RenderActionBar = {
  tick: 5, abilities: [slot, slot], capture: undefined, swaps: [{ sprite: 'a', dead: false }, { sprite: 'b', dead: false }],
  swapReadyTick: 0, swapCooldownTicks: 50, trap: { readyTick: 0, cooldownTicks: 500, count: 0, max: 2 },
  elemental: { name: 'Ember', kind: 1, readyTick: 0, cooldownTicks: 1750, activeUntil: 0 },
};
const arcade = { meter: 0, weatherCharge: 0, guard: 1000, guarding: false, dashIn: 0, chargeIn: -1, cleanseIn: 0, keepCharge: false };

describe('grouped action bar prototype', () => {
  it('is only on for ?ff=barGroups in dev/test builds', () => {
    expect(wantsGroupedBar('?ff=arcade,barGroups', true)).toBe(true);
    expect(wantsGroupedBar('?ff=barGroups', false)).toBe(false);
    expect(wantsGroupedBar('', true)).toBe(false);
  });

  it('puts hero slots first, then common, then team, keeping every box and its sim fields', () => {
    const flat = buildSlots(bar, undefined, arcade);
    const g = groupSlots(flat);
    expect(g.slots).toHaveLength(flat.length);
    const rank = (s: { kind: Parameters<typeof groupOf>[0] }): number => ['hero', 'common', 'team'].indexOf(groupOf(s.kind));
    const ranks = g.slots.map(rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(g.slots.slice(0, 3).map((s) => s.kind)).toEqual(['ability', 'ability', 'trap']);
    for (const s of g.slots) {
      const orig = flat.find((f) => f.kind === s.kind && f.cmd === s.cmd && f.label === s.label && f.icon === s.icon);
      expect(orig?.progress).toBe(s.progress);
      expect(orig?.touch).toBe(s.touch);
    }
    expect(g.headers.map((h) => h.text)).toEqual(['HERO', 'COMMON', 'TEAM']);
  });

  it('never overlaps boxes and stays inside the 1280 px width, wrapping upward', () => {
    for (const k of [undefined, 0.5, 0.3]) {
      const g = groupSlots(buildSlots(bar, undefined, arcade, k), k);
      for (const s of g.slots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x + s.size).toBeLessThanOrEqual(1280);
        expect(s.y + s.size).toBeLessThanOrEqual(720);
      }
      for (const a of g.slots) {
        for (const b of g.slots) {
          if (a === b) continue;
          expect(a.x + a.size <= b.x || b.x + b.size <= a.x || a.y + a.size <= b.y || b.y + b.size <= a.y).toBe(true);
        }
      }
      expect(g.top).toBeLessThan(640);
    }
  });
});
