import { describe, expect, it } from 'vitest';
import { allocEntity, freeEntity, isAlive, liveIds } from './alloc';
import { MAX_ENTITIES, World, createSimState, restoreState, snapshotState } from './state';

describe('sim state alloc', () => {
  it('allocates lowest id first and reuses freed ids deterministically', () => {
    const s = createSimState(7);
    expect([allocEntity(s), allocEntity(s), allocEntity(s), allocEntity(s)]).toEqual([0, 1, 2, 3]);
    freeEntity(s, 2);
    freeEntity(s, 0);
    expect(allocEntity(s)).toBe(0);
    expect(allocEntity(s)).toBe(2);
    expect(allocEntity(s)).toBe(4);
    expect(liveIds(s)).toEqual([0, 1, 2, 3, 4]);
    expect(s.world[World.nextId]).toBe(7);
  });

  it('returns -1 when full and ignores double free', () => {
    const s = createSimState();
    for (let i = 0; i < MAX_ENTITIES; i++) allocEntity(s);
    expect(allocEntity(s)).toBe(-1);
    freeEntity(s, 5);
    freeEntity(s, 5);
    expect(isAlive(s, 5)).toBe(false);
    expect(allocEntity(s)).toBe(5);
  });

  it('snapshot/restore is exact', () => {
    const s = createSimState(42);
    const a = allocEntity(s);
    s.x[a] = 1.5;
    s.hp[a] = 100;
    const snap = snapshotState(s);
    freeEntity(s, a);
    s.x[3] = 9;
    restoreState(s, snap);
    expect(s.x[a]).toBe(1.5);
    expect(isAlive(s, a)).toBe(true);
    expect(s.x[3]).toBe(0);
    expect(s.world[World.matchSeed]).toBe(42);
  });
});
