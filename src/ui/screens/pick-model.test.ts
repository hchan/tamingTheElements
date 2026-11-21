import { describe, expect, it } from 'vitest';
import {
  allMine, cancel, complete, createTeam, heroes, lock, mineCount, missing, pickKeyAction, randomFill, removeAt,
  setAt, setSize,
} from './pick-model';

describe('pick-model', () => {
  it('starts with suggestions, not mine', () => {
    const t = createTeam(3, ['a', 'b']);
    expect(t.slots).toEqual([{ hero: 'a', mine: false }, { hero: 'b', mine: false }, null]);
    expect(complete(t)).toBe(false);
    expect(missing(t)).toBe(3);
  });

  it('lock fills the first empty or suggested slot', () => {
    const t = createTeam(3, ['a']);
    expect(lock(t, 'x')).toMatchObject({ ok: true, index: 0 });
    expect(lock(t, 'y')).toMatchObject({ ok: true, index: 1 });
    expect(heroes(t)).toEqual(['x', 'y', '']);
  });

  it('refuses a duplicate mine hero with an announcement', () => {
    const t = createTeam(2);
    lock(t, 'pax');
    const r = lock(t, 'pax');
    expect(r.ok).toBe(false);
    expect(r.message).toBe('pax is already on your team');
    expect(mineCount(t)).toBe(1);
  });

  it('the other team may hold the same hero', () => {
    const a = createTeam(1);
    const b = createTeam(1);
    expect(lock(a, 'pax').ok).toBe(true);
    expect(lock(b, 'pax').ok).toBe(true);
  });

  it('swaps a suggestion found elsewhere so the team stays complete', () => {
    const t = createTeam(2, ['a', 'b']);
    lock(t, 'b');
    expect(t.slots).toEqual([{ hero: 'b', mine: true }, { hero: 'a', mine: false }]);
    expect(complete(t)).toBe(true);
    expect(allMine(t)).toBe(false);
  });

  it('refuses when full, and while ready', () => {
    const t = createTeam(1);
    lock(t, 'a');
    expect(lock(t, 'b').message).toBe('Team full: press Fight!, or remove a hero first');
    t.ready = true;
    expect(lock(t, 'c').ok).toBe(false);
  });

  it('cancel un-readies first, then pops the last mine pick', () => {
    const t = createTeam(3, ['s']);
    lock(t, 'a');
    lock(t, 'b');
    t.ready = true;
    expect(cancel(t)).toBe(-1);
    expect(t.ready).toBe(false);
    expect(cancel(t)).toBe(1);
    expect(heroes(t)).toEqual(['a', '', '']);
    expect(cancel(t)).toBe(0);
    expect(cancel(t)).toBe(-1);
  });

  it('removeAt shifts later slots up and empties the last', () => {
    const t = createTeam(3);
    lock(t, 'a');
    lock(t, 'b');
    lock(t, 'c');
    removeAt(t, 0);
    expect(heroes(t)).toEqual(['b', 'c', '']);
    removeAt(t, 9);
    expect(heroes(t)).toEqual(['b', 'c', '']);
  });

  it('setAt does not refuse duplicates and "" empties', () => {
    const t = createTeam(2);
    setAt(t, 0, 'pax');
    setAt(t, 1, 'pax');
    expect(heroes(t)).toEqual(['pax', 'pax']);
    expect(allMine(t)).toBe(true);
    setAt(t, 0, '');
    expect(t.slots[0]).toBeNull();
    expect(t.slots[1]).toEqual({ hero: 'pax', mine: true });
  });

  it('setSize truncates or extends with suggestions', () => {
    const t = createTeam(3);
    lock(t, 'a');
    setSize(t, 1);
    expect(t.slots).toHaveLength(1);
    setSize(t, 3, ['z', 'y', 'x']);
    expect(t.slots).toEqual([{ hero: 'a', mine: true }, { hero: 'y', mine: false }, { hero: 'x', mine: false }]);
  });

  it('pick key readies or fights only on a complete all-mine team', () => {
    const t = createTeam(2, ['a', 'b']);
    expect(pickKeyAction(t, false)).toBe('lock');
    lock(t, 'x');
    expect(pickKeyAction(t, true)).toBe('lock');
    lock(t, 'y');
    expect(pickKeyAction(t, false)).toBe('ready');
    expect(pickKeyAction(t, true)).toBe('fight');
  });

  it('randomFill uses the injected rng, never duplicates, counts as mine', () => {
    const t = createTeam(3, ['s']);
    const pool = ['a', 'b', 'c'];
    expect(randomFill(t, pool, () => 0.99).ok).toBe(true);
    expect(randomFill(t, pool, () => 0.99).ok).toBe(true);
    expect(randomFill(t, pool, () => 0).ok).toBe(true);
    expect(heroes(t).sort()).toEqual(['a', 'b', 'c']);
    expect(allMine(t)).toBe(true);
    expect(randomFill(createTeam(2), [], () => 0).ok).toBe(false);
    const u = createTeam(2);
    lock(u, 'a');
    expect(randomFill(u, ['a'], () => 0).ok).toBe(false);
  });
});
