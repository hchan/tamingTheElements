import { describe, expect, it } from 'vitest';
import { newEmptyState } from '@core/index';
import { MENU_ITEMS, loadSave, menuState } from './main-menu';

describe('menuState', () => {
  it('disables garrison and objectives with no save', () => {
    expect(menuState(null)).toEqual({
      garrison: false,
      settings: true,
      objectives: false,
      newObjectives: false,
    });
  });

  it('chapter 0 empty state has no objectives', () => {
    const s = menuState(newEmptyState());
    expect(s.objectives).toBe(false);
    expect(s.garrison).toBe(false);
  });

  it('enables everything and flags NEW when chapter 1 objectives are met', () => {
    const save = {
      ...newEmptyState(),
      chapter: 1,
      garrison: [{ id: 'a', experience: 1, characterName: 'Fiara' }],
    };
    expect(menuState(save)).toMatchObject({ garrison: true, objectives: true, newObjectives: false });
    const met = { ...save, garrison: [{ id: 'a', experience: 5, characterName: 'Fiara' }] };
    expect(menuState(met).newObjectives).toBe(true);
  });
});

describe('menu order', () => {
  it('has exactly five always-enabled entries: Play, Versus, Online, Settings, Help', () => {
    expect(MENU_ITEMS.map((i) => [i.label, i.route])).toEqual([
      ['Play', 'tour'],
      ['Versus', 'arcade'],
      ['Online', 'online'],
      ['Settings', 'settings'],
      ['Help', 'help'],
    ]);
    for (const i of MENU_ITEMS) expect(i.enabled(menuState(null))).toBe(true);
  });
});

describe('loadSave', () => {
  it('returns null for missing, garbage or unreadable data', () => {
    expect(loadSave({ getItem: () => null })).toBeNull();
    expect(loadSave({ getItem: () => '{nope' })).toBeNull();
  });

  it('migrates a legacy v0 save', () => {
    const v0 = JSON.stringify({ chapter: 1, garrison: [{ id: 'x', experience: 1, characterName: 'Echo' }] });
    expect(loadSave({ getItem: () => v0 })?.chapter).toBe(1);
  });
});
