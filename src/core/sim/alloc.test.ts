import { describe, expect, it } from 'vitest';
import { allocEntity, freeEntity, isAlive, liveIds } from './alloc';
import { hash } from './hash';
import { MAX_ENTITIES, STATUS_SLOTS, STATUS_STRIDE, World, createSimState, restoreState, snapshotState } from './state';

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

  it('freeing an entity clears its status slots and only its own', () => {
    const s = createSimState(3);
    const a = allocEntity(s);
    const b = allocEntity(s);
    const clean = createSimState(3);
    allocEntity(clean);
    allocEntity(clean);
    const per = STATUS_SLOTS * STATUS_STRIDE;
    s.status.fill(7, a * per, (a + 1) * per);
    s.status.fill(9, b * per, (b + 1) * per);
    freeEntity(s, a);
    expect(Array.from(s.status.subarray(a * per, (a + 1) * per))).toEqual(new Array<number>(per).fill(0));
    expect(Array.from(s.status.subarray(b * per, (b + 1) * per))).toEqual(new Array<number>(per).fill(9));
    freeEntity(s, b);
    freeEntity(clean, a);
    freeEntity(clean, b);
    expect(hash(s)).toBe(hash(clean));
  });
});
