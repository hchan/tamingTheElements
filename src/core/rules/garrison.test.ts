import { describe, expect, it } from 'vitest';
import data from '../../../tests/fixtures/legacy/data.json';
import { seedSfc32 } from '../rng/seed';
import { MAX_SIZE, addCaptured, metaIdSource, sortGarrison } from './garrison';
import type { GarrisonEntry, GarrisonSave } from './garrison';

const e = (id: string, experience: number, characterName: string): GarrisonEntry => ({
  id,
  experience,
  characterName,
  createdTime: 0,
  lastModifiedTime: 0,
});
const sample = [e('d', 5, 'Pax'), e('c', 9, 'Fiara'), e('b', 5, 'Echo'), e('a', 5, 'Echo'), e('f', 9, 'Morblass')];
const ids = (g: readonly GarrisonEntry[]): string => g.map((x) => x.id).join('');

describe('sortGarrison', () => {
  it('order 1: experience desc, name, element, id', () => {
    expect(ids(sortGarrison(sample, 1))).toBe('cfabd');
  });
  it('order 2: name, experience desc, element, id', () => {
    expect(ids(sortGarrison(sample, 2))).toBe('abcfd');
  });
  it('order 3: element (fire, air, earth, water), experience desc, name, id', () => {
    expect(ids(sortGarrison(sample, 3))).toBe('cabdf');
  });
  it('is deterministic under input permutation and does not mutate', () => {
    const rev = [...sample].reverse();
    for (const o of [1, 2, 3]) expect(ids(sortGarrison(rev, o))).toBe(ids(sortGarrison(sample, o)));
    expect(ids(sample)).toBe('dcbaf');
  });
});

describe('addCaptured', () => {
  const clock = { now: () => 1234 };
  it('appends a fresh entry without mutating', () => {
    const save: GarrisonSave = { garrison: [e('x', 3, 'Pax')] };
    const next = addCaptured(save, 'Lavax', clock, { next: () => 'new-id' });
    expect(save.garrison).toHaveLength(1);
    expect(next.garrison[1]).toEqual({
      id: 'new-id',
      experience: 0,
      characterName: 'Lavax',
      createdTime: 1234,
      lastModifiedTime: 1234,
    });
  });
  it('accepts an 11th character (legacy parity)', () => {
    let save: GarrisonSave = { garrison: [] };
    for (let i = 0; i < MAX_SIZE + 1; i++) save = addCaptured(save, 'Pax', clock, { next: () => String(i) });
    expect(save.garrison).toHaveLength(11);
  });
  // KNOWN-BUG:garrison-max-size-unenforced
  it.fails('enforces MAX_SIZE', () => {
    let save: GarrisonSave = { garrison: [] };
    for (let i = 0; i < MAX_SIZE + 1; i++) save = addCaptured(save, 'Pax', clock, { next: () => String(i) });
    expect(save.garrison).toHaveLength(MAX_SIZE);
  });
});

describe('metaIdSource', () => {
  it('yields uuid-shaped, reproducible, distinct ids', () => {
    const a = metaIdSource(seedSfc32(1, 'meta'));
    const b = metaIdSource(seedSfc32(1, 'meta'));
    const x = a.next();
    expect(x).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(b.next()).toBe(x);
    expect(a.next()).not.toBe(x);
  });
  it('MAX_SIZE matches the legacy fixture', () => {
    expect(MAX_SIZE).toBe(data.garrison.MAX_SIZE);
  });
});
