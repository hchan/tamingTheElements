import { describe, expect, it } from 'vitest';
import { REORDER_MAX_HELD, REORDER_SKIP_MS, ReorderBuffer } from './reorder';

describe('ReorderBuffer', () => {
  it('delivers in order frames straight away', () => {
    const r = new ReorderBuffer<number>();
    expect([0, 1, 2].flatMap((s) => r.push(s, s, 0))).toEqual([0, 1, 2]);
    expect(r.nextSeq).toBe(3);
  });

  it('holds a gap and releases the run when it fills', () => {
    const r = new ReorderBuffer<number>();
    expect(r.push(2, 2, 0)).toEqual([]);
    expect(r.push(1, 1, 0)).toEqual([]);
    expect(r.pending).toBe(2);
    expect(r.push(0, 0, 1)).toEqual([0, 1, 2]);
    expect(r.pending).toBe(0);
  });

  it('drops duplicates and stale frames', () => {
    const r = new ReorderBuffer<number>();
    r.push(0, 0, 0);
    expect(r.push(0, 0, 0)).toEqual([]);
    r.push(3, 3, 0);
    expect(r.push(3, 3, 0)).toEqual([]);
    expect(r.dropped).toBe(2);
  });

  it('skips ahead after 40 ms and treats the late frame as stale', () => {
    const r = new ReorderBuffer<number>();
    r.push(2, 2, 100);
    r.push(3, 3, 110);
    expect(r.poll(100 + REORDER_SKIP_MS - 1)).toEqual([]);
    expect(r.poll(100 + REORDER_SKIP_MS)).toEqual([2, 3]);
    expect(r.nextSeq).toBe(4);
    expect(r.push(0, 0, 200)).toEqual([]);
    expect(r.skipped).toBe(1);
    expect(r.poll(1000)).toEqual([]);
  });

  it('skips ahead at once when more than 8 frames are held', () => {
    const r = new ReorderBuffer<number>();
    let out: number[] = [];
    for (let s = 1; s <= REORDER_MAX_HELD; s++) out = out.concat(r.push(s, s, 0));
    expect(out).toEqual([]);
    expect(r.push(REORDER_MAX_HELD + 1, REORDER_MAX_HELD + 1, 0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(r.nextSeq).toBe(10);
  });

  it('keeps order for shuffled arrivals across the u32 wrap', () => {
    const r = new ReorderBuffer<number>(0xfffffffe);
    expect([1, 0, 3, 2].flatMap((i) => r.push((0xfffffffe + i) >>> 0, i, 0))).toEqual([0, 1, 2, 3]);
    expect(r.nextSeq).toBe(2);
    expect(r.push(0xfffffffe, 9, 0)).toEqual([]);
  });
});
