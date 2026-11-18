import { describe, expect, it } from 'vitest';
import { InMemoryStore } from './memory-store';
import { ReorderBuffer } from './seq';

describe('ReorderBuffer', () => {
  it('delivers in order and drops duplicates and stale frames', () => {
    const b = new ReorderBuffer<string>(8, 40);
    expect(b.push(0, 'a', 0)).toEqual(['a']);
    expect(b.push(0, 'a2', 1)).toEqual([]);
    expect(b.push(1, 'b', 2)).toEqual(['b']);
    expect(b.nextSeq).toBe(2);
  });
  it('holds a gap then releases when it fills', () => {
    const b = new ReorderBuffer<string>(8, 40);
    expect(b.push(2, 'c', 0)).toEqual([]);
    expect(b.push(2, 'c again', 1)).toEqual([]);
    expect(b.holding).toBe(1);
    expect(b.push(1, 'b', 2)).toEqual([]);
    expect(b.push(0, 'a', 3)).toEqual(['a', 'b', 'c']);
  });
  it('skips ahead after the timeout', () => {
    const b = new ReorderBuffer<string>(8, 40);
    b.push(3, 'd', 100);
    expect(b.poll(120)).toEqual([]);
    expect(b.poll(140)).toEqual(['d']);
    expect(b.nextSeq).toBe(4);
  });
  it('skips ahead when more than holdMax frames are held', () => {
    const b = new ReorderBuffer<number>(2, 1000);
    expect(b.push(1, 1, 0)).toEqual([]);
    expect(b.push(2, 2, 0)).toEqual([]);
    expect(b.push(3, 3, 0)).toEqual([1, 2, 3]);
  });
  it('treats a seq far behind (wrapped) as stale', () => {
    const b = new ReorderBuffer<number>();
    expect(b.push(0xfffffffe, 9, 0)).toEqual([]);
    expect(b.push(0, 1, 1)).toEqual([1]);
  });
});

describe('InMemoryStore', () => {
  it('versions, conditional puts and copies', async () => {
    const s = new InMemoryStore(() => 0);
    expect(await s.put('k', { a: 1 }, { ifVersion: 'absent' })).toBe(true);
    expect(await s.put('k', { a: 2 }, { ifVersion: 'absent' })).toBe(false);
    const it1 = await s.get('k');
    expect(it1).toEqual({ value: { a: 1 }, version: 1 });
    expect(await s.put('k', { a: 3 }, { ifVersion: 5 })).toBe(false);
    expect(await s.put('nope', 1, { ifVersion: 1 })).toBe(false);
    expect(await s.put('k', { a: 3 }, { ifVersion: 1 })).toBe(true);
    expect((await s.get('k'))?.version).toBe(2);
    expect(await s.keys('k')).toEqual(['k']);
    expect(s.size).toBe(1);
    await s.delete('k');
    expect(await s.get('k')).toBeUndefined();
  });
  it('expires lazily', async () => {
    let t = 0;
    const s = new InMemoryStore(() => t);
    await s.put('k', 1, { expiresAtMs: 10 });
    expect(await s.keys('')).toEqual(['k']);
    t = 10;
    expect(await s.get('k')).toBeUndefined();
    expect(await s.keys('')).toEqual([]);
    expect(s.size).toBe(0);
  });
});
