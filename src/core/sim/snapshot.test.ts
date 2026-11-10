import { describe, expect, it } from 'vitest';
import { allocEntity } from './alloc';
import { assertNoNaN, hash } from './hash';
import { SnapshotRing, createSnapshotBuf, restore, snapshot } from './snapshot';
import { createSimState, World } from './state';

function populated() {
  const s = createSimState(5);
  const a = allocEntity(s);
  s.x[a] = 1.5;
  s.hp[a] = 10;
  s.rng[3] = 0xdeadbeef;
  return { s, a };
}

describe('snapshot and hash', () => {
  it('restore then hash is equal', () => {
    const { s, a } = populated();
    const h = hash(s);
    const buf = createSnapshotBuf(s);
    snapshot(s, buf);
    s.x[a] = 99;
    s.world[World.tick] = 12;
    expect(hash(s)).not.toBe(h);
    restore(s, buf);
    expect(hash(s)).toBe(h);
  });

  it('-0 and 0 hash the same', () => {
    const { s, a } = populated();
    s.vx[a] = 0;
    const h = hash(s);
    s.vx[a] = -0;
    expect(hash(s)).toBe(h);
  });

  it('different NaN payloads hash the same, and NaN is detected', () => {
    const { s, a } = populated();
    s.vy[a] = NaN;
    const h = hash(s);
    const u = new Uint32Array(s.vy.buffer);
    u[a * 2] = 0x12345678;
    u[a * 2 + 1] = 0x7ff80001;
    expect(Number.isNaN(s.vy[a])).toBe(true);
    expect(hash(s)).toBe(h);
    expect(() => { assertNoNaN(s); }).toThrow();
    expect(() => { assertNoNaN(s, false); }).not.toThrow();
    s.vy[a] = 0;
    expect(() => { assertNoNaN(s); }).not.toThrow();
  });

  it('hash does not mutate state', () => {
    const { s, a } = populated();
    s.vx[a] = -0;
    hash(s);
    expect(Object.is(s.vx[a], -0)).toBe(true);
  });

  it('ring wraps and restores held ticks only', () => {
    const { s, a } = populated();
    const ring = new SnapshotRing(s, 3);
    for (let t = 0; t < 5; t++) {
      s.x[a] = t;
      ring.push(s, t);
    }
    expect(ring.size).toBe(3);
    expect(ring.heldTicks()).toEqual([2, 3, 4]);
    expect(ring.restoreTick(s, 1)).toBe(false);
    expect(ring.restoreTick(s, 3)).toBe(true);
    expect(s.x[a]).toBe(3);
    expect(() => new SnapshotRing(s, 0)).toThrow();
  });

  it('restoreTick picks the newest snapshot of a tick, not the lowest slot', () => {
    const { s, a } = populated();
    const ring = new SnapshotRing(s, 3);
    s.x[a] = 1;
    ring.push(s, 5);
    s.x[a] = 2;
    ring.push(s, 6);
    s.x[a] = 3;
    ring.push(s, 5); // re-simulated tick 5 after a rollback: slot 2, newer than slot 0
    s.x[a] = 0;
    expect(ring.restoreTick(s, 5)).toBe(true);
    expect(s.x[a]).toBe(3);
    expect(ring.heldTicks()).toEqual([5, 6, 5]);
  });

  it('restoreTick drops the entries pushed after the restored one, also after wrapping', () => {
    const { s, a } = populated();
    const ring = new SnapshotRing(s, 4);
    for (let t = 0; t < 6; t++) {
      s.x[a] = t;
      ring.push(s, t);
    }
    expect(ring.heldTicks()).toEqual([2, 3, 4, 5]);
    expect(ring.restoreTick(s, 3)).toBe(true);
    expect(s.x[a]).toBe(3);
    expect(ring.size).toBe(2);
    expect(ring.heldTicks()).toEqual([2, 3]);
    expect(ring.restoreTick(s, 5)).toBe(false);
    expect(s.x[a]).toBe(3);
    s.x[a] = 40;
    ring.push(s, 4);
    expect(ring.heldTicks()).toEqual([2, 3, 4]);
    expect(ring.restoreTick(s, 2)).toBe(true);
    expect(s.x[a]).toBe(2);
    expect(ring.heldTicks()).toEqual([2]);
  });
});
