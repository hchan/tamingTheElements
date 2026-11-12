import { describe, expect, it } from 'vitest';
import { StatusId, type RenderStatus, type RenderView } from '@core/index';
import { BUFF_SLOT, FRIENDLY_COLOR, HC_FRIENDLY_COLOR, HC_HOSTILE_COLOR, HOSTILE_COLOR, collectBuffs, elapsedFraction, isHostile } from './buffs';
import { mainBar } from './bars';

const viewWith = (tick: number, statuses: Record<number, Partial<RenderStatus>[]>): RenderView =>
  ({
    tick,
    forEachStatus: (id: number, visit: (s: RenderStatus) => void) => {
      for (const s of statuses[id] ?? []) visit({ id: 0, startTick: 0, expireTick: 100, ...s });
    },
  }) as unknown as RenderView;

describe('buff slots', () => {
  it('classifies only the slowing or disabling statuses as hostile', () => {
    expect(isHostile(StatusId.tornado)).toBe(true);
    expect(isHostile(StatusId.iceBlast)).toBe(true);
    expect(isHostile(StatusId.superSlow)).toBe(true);
    for (const id of [StatusId.adrenaline, StatusId.fireDance, StatusId.rockArmour, StatusId.translucent, StatusId.superSpeed, StatusId.superArmour]) {
      expect(isHostile(id)).toBe(false);
    }
  });

  it('elapsed fraction is clamped and a zero-length status counts as finished', () => {
    expect(elapsedFraction(50, 0, 100)).toBe(0.5);
    expect(elapsedFraction(-10, 0, 100)).toBe(0);
    expect(elapsedFraction(500, 0, 100)).toBe(1);
    expect(elapsedFraction(5, 10, 10)).toBe(1);
  });

  it('lays out one slot per status left to right with shape and colour for friend or foe', () => {
    const view = viewWith(50, {
      7: [
        { id: StatusId.tornado, startTick: 0, expireTick: 100 },
        { id: StatusId.adrenaline, startTick: 25, expireTick: 75 },
      ],
    });
    const slots = collectBuffs(view, 7, 0);
    expect(slots).toHaveLength(2);
    const minX = mainBar(0).minX;
    expect(slots[0]).toMatchObject({ x: minX, hostile: true, glyph: 'cross', color: HOSTILE_COLOR, elapsed: 0.5 });
    expect(slots[1]).toMatchObject({ x: minX + BUFF_SLOT, hostile: false, glyph: 'plus', color: FRIENDLY_COLOR, elapsed: 0.5 });
    expect(slots[0]?.y).toBe(slots[1]?.y);
  });

  it('uses the colour-blind-safe pair in high contrast and keeps the shape cue', () => {
    const view = viewWith(0, { 1: [{ id: StatusId.iceBlast }, { id: StatusId.adrenaline }] });
    const [hostile, friendly] = collectBuffs(view, 1, 0, true);
    expect(hostile?.color).toBe(HC_HOSTILE_COLOR);
    expect(friendly?.color).toBe(HC_FRIENDLY_COLOR);
    expect(hostile?.glyph).not.toBe(friendly?.glyph);
  });

  it('returns nothing for an entity with no statuses and shifts with the side offset', () => {
    expect(collectBuffs(viewWith(0, {}), 3, 0)).toEqual([]);
    const v = viewWith(0, { 3: [{ id: StatusId.adrenaline }] });
    const a = collectBuffs(v, 3, 0)[0];
    const b = collectBuffs(v, 3, 640)[0];
    expect((b?.x ?? 0) - (a?.x ?? 0)).toBe(mainBar(640).minX - mainBar(0).minX);
  });
});
