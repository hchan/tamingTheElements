import { describe, expect, it } from 'vitest';
import { seedSfc32 } from '@core/index';
import {
  EMPTY_SELECTION,
  buildMatchSetup,
  buttonStates,
  displayOrder,
  orderNumber,
  rowView,
  toggleSelection,
} from './garrison-model';
import type { Selection } from './garrison-model';

const g = (id: string, characterName: string, experience: number) => ({
  id,
  characterName,
  experience,
  createdTime: 0,
  lastModifiedTime: 0,
});

describe('selection', () => {
  it('single-selects in chapters 1-2 and clears on re-click', () => {
    let s = toggleSelection(EMPTY_SELECTION, 'a', 1);
    s = toggleSelection(s, 'b', 1);
    expect(s.order).toEqual(['b']);
    expect(toggleSelection(s, 'b', 2).order).toEqual([]);
  });

  it('numbers up to three heroes later and evicts slot 3 on a fourth pick', () => {
    let s = EMPTY_SELECTION;
    for (const id of ['a', 'b', 'c']) s = toggleSelection(s, id, 3);
    expect(orderNumber(s, 'c')).toBe(3);
    s = toggleSelection(s, 'd', 3);
    expect(s.order).toEqual(['a', 'b', 'd']);
    expect(orderNumber(s, 'c')).toBeNull();
  });

  it('a freed slot is reused by the next pick', () => {
    let s: Selection = { order: ['a', 'b', 'c'] };
    s = toggleSelection(s, 'a', 4);
    expect(s.order).toEqual(['b', 'c']);
  });
});

describe('buttonStates', () => {
  it('follows the legacy enable rules', () => {
    expect(buttonStates(1, 0).battle).toEqual({ enabled: false, message: 'No hero has been selected yet!' });
    expect(buttonStates(2, 1).battle.enabled).toBe(true);
    expect(buttonStates(3, 2).battle.message).toBe('You must select 3 heroes.  Only 2 has been selected so far');
    expect(buttonStates(3, 3).battle.enabled).toBe(true);
    expect(buttonStates(1, 1).practice.enabled).toBe(true);
    expect(buttonStates(4, 2).portal.enabled).toBe(false);
    expect(buttonStates(4, 3).portal.enabled).toBe(true);
    expect(buttonStates(3, 3).portalVisible).toBe(false);
    expect(buttonStates(4, 0).portalVisible).toBe(true);
  });
});

describe('displayOrder', () => {
  const garrison = [g('1', 'Pax', 2), g('2', 'Echo', 9), g('3', 'Fiara', 5)];

  it('applies the garrison sort setting', () => {
    expect(displayOrder({ garrisonSortOrder: 1, garrison }).map((x) => x.id)).toEqual(['2', '3', '1']);
    expect(displayOrder({ garrisonSortOrder: 2, garrison }).map((x) => x.id)).toEqual(['2', '3', '1']);
    const byName = [g('1', 'Pax', 2), g('2', 'Echo', 9), g('3', 'Aaa', 5)];
    expect(displayOrder({ garrisonSortOrder: 2, garrison: byName }).map((x) => x.id)).toEqual(['3', '2', '1']);
  });
});

describe('rowView', () => {
  it('derives level, element and sprite', () => {
    expect(rowView(g('1', 'Curomo', 6))).toMatchObject({ level: 5, element: 'water', sprite: 'curomo' });
  });
});

describe('buildMatchSetup', () => {
  const save = { chapter: 4, garrison: [g('a', 'Fiara', 5), g('b', 'Echo', 7), g('c', 'Pax', 9)] };
  const sel = { order: ['c', 'a', 'b'] };

  it('returns null when not ready', () => {
    expect(buildMatchSetup('battle', save, { order: ['a'] }, seedSfc32(1, 'meta'))).toBeNull();
  });

  it('battle: heroes in battle order, one opponent each, deterministic per seed', () => {
    const a = buildMatchSetup('battle', save, sel, seedSfc32(7, 'meta'));
    const b = buildMatchSetup('battle', save, sel, seedSfc32(7, 'meta'));
    expect(a?.heroes.map((h) => h.id)).toEqual(['c', 'a', 'b']);
    expect(a?.opponents.map((o) => o.id)).toEqual(['copponent', 'aopponent', 'bopponent']);
    expect(a).toEqual(b);
  });

  it('practice uses the dummy at the first hero XP; portal uses the last boss', () => {
    expect(buildMatchSetup('practice', save, sel, seedSfc32(1, 'meta'))?.opponents).toEqual([
      { id: 'Dummy', experience: 9, characterName: 'Dummy' },
    ]);
    expect(buildMatchSetup('portal', save, sel, seedSfc32(1, 'meta'))?.opponents[0]?.characterName).toBe(
      'Eternal Void',
    );
  });
});
