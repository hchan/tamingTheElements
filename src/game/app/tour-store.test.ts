import { describe, expect, it } from 'vitest';
import type { CharacterId } from '@core/index';
import { startRun } from './tour-model';
import { TOUR_KEY, clearRun, loadRun, saveRun, type TourStorage } from './tour-store';

function fake(): TourStorage & { map: Map<string, string>; log: string[] } {
  const map = new Map<string, string>();
  const log: string[] = [];
  return {
    map,
    log,
    getItem: (k) => (log.push(k), map.get(k) ?? null),
    setItem: (k, v) => {
      log.push(k);
      map.set(k, v);
    },
    removeItem: (k) => {
      log.push(k);
      map.delete(k);
    },
  };
}

const throwing: TourStorage = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

describe('tour store', () => {
  const run = startRun(['fiara', 'rokcore', 'curomo'] as CharacterId[], 1234);

  it('round-trips a run under its own key', () => {
    const s = fake();
    expect(loadRun(s)).toBeUndefined();
    expect(saveRun(s, run)).toBe(true);
    expect([...s.map.keys()]).toEqual([TOUR_KEY]);
    expect(loadRun(s)).toEqual(run);
  });

  it('clear removes the run', () => {
    const s = fake();
    saveRun(s, run);
    expect(clearRun(s)).toBe(true);
    expect(loadRun(s)).toBeUndefined();
  });

  it('returns undefined for corrupt data', () => {
    const s = fake();
    for (const bad of ['', '{', 'null', '[]', '{"v":2}', JSON.stringify({ v: 1, seed: 1 })]) {
      s.map.set(TOUR_KEY, bad);
      expect(loadRun(s)).toBeUndefined();
    }
  });

  it('tolerates missing or throwing storage', () => {
    expect(loadRun(undefined)).toBeUndefined();
    expect(saveRun(undefined, run)).toBe(false);
    expect(clearRun(undefined)).toBe(false);
    expect(loadRun(throwing)).toBeUndefined();
    expect(saveRun(throwing, run)).toBe(false);
    expect(clearRun(throwing)).toBe(false);
  });

  it('touches no key but its own', () => {
    const s = fake();
    saveRun(s, run);
    loadRun(s);
    clearRun(s);
    expect(new Set(s.log)).toEqual(new Set([TOUR_KEY]));
  });
});
