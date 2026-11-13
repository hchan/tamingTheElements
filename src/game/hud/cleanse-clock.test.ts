import { SimEventKind, type SimEvent } from '@core/index';
import { describe, expect, it } from 'vitest';
import { CLEANSE_COOLDOWN, CleanseClock } from './cleanse-clock';
import { elementalShown } from '../platform/cleanse-info';

const cast = (sourceId: number): SimEvent => ({ tick: 1, sourceId, kind: SimEventKind.cleanse, seq: 0, element: 2, team: 0, cleared: 1 });

describe('CleanseClock', () => {
  it('is 10 s at 50 Hz, as the sim constant (core/data/arcade.ts, pinned by its own test)', () => {
    expect(CLEANSE_COOLDOWN).toBe(500);
  });
  it('counts down from the cast, per hero, and is ready otherwise', () => {
    const c = new CleanseClock();
    expect(c.leftIn(3, 100)).toBe(0);
    c.consume([cast(3)], 100);
    expect(c.leftIn(3, 100)).toBe(CLEANSE_COOLDOWN);
    expect(c.leftIn(3, 400)).toBe(CLEANSE_COOLDOWN - 300);
    expect(c.leftIn(3, 700)).toBe(0);
    expect(c.leftIn(4, 100)).toBe(0);
  });
  it('forgets on a new round or when time runs backwards', () => {
    const c = new CleanseClock();
    c.sync(1, 10);
    c.consume([cast(3)], 10);
    c.sync(1, 20);
    expect(c.leftIn(3, 20)).toBeGreaterThan(0);
    c.sync(2, 30);
    expect(c.leftIn(3, 30)).toBe(0);
    c.consume([cast(3)], 30);
    c.sync(2, 5);
    expect(c.leftIn(3, 5)).toBe(0);
  });
});

describe('elementalShown', () => {
  it("renames only water's Cleanse", () => {
    expect(elementalShown('Cleanse')).toBe('Tidecall');
    expect(elementalShown('Ember')).toBe('Ember');
  });
});
