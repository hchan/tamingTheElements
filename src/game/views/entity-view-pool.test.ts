import { describe, expect, it } from 'vitest';
import { EntityViewPool } from './entity-view-pool';

function make() {
  let made = 0;
  const parked: number[] = [];
  const pool = new EntityViewPool<{ n: number }>(
    () => ({ n: made++ }),
    (v) => parked.push(v.n),
  );
  return { pool, parked, made: () => made };
}

describe('EntityViewPool', () => {
  it('returns the same view for the same id within and across frames', () => {
    const { pool } = make();
    pool.begin();
    const a = pool.acquire(3);
    expect(pool.acquire(3)).toBe(a);
    pool.end();
    pool.begin();
    expect(pool.acquire(3)).toBe(a);
    pool.end();
    expect(pool.peek(3)).toBe(a);
  });

  it('parks unseen views and reuses them for new ids', () => {
    const { pool, parked, made } = make();
    pool.begin();
    const a = pool.acquire(1);
    pool.acquire(2);
    pool.end();
    pool.begin();
    pool.acquire(2);
    pool.end();
    expect(parked).toEqual([a.n]);
    expect(pool.peek(1)).toBeUndefined();
    pool.begin();
    pool.acquire(2);
    expect(pool.acquire(9)).toBe(a);
    pool.end();
    expect(made()).toBe(2);
    expect(pool.peek(9)).toBe(a);
  });

  it('visits active and parked views', () => {
    const { pool } = make();
    pool.begin();
    pool.acquire(1);
    pool.acquire(2);
    pool.end();
    pool.begin();
    pool.acquire(1);
    pool.end();
    let n = 0;
    pool.forEachView(() => n++);
    expect(n).toBe(2);
  });
});
