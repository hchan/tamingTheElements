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
  const buttons = MENU_ITEMS.filter((i) => i.heading !== true).map((i) => i.label);

  it('leads with World Tour, Arcade Versus and Online Versus, always enabled and on by default', () => {
    expect(buttons.slice(0, 3)).toEqual(['World Tour', 'Arcade Versus', 'Online Versus']);
    for (const r of ['tour', 'arcade', 'online']) expect(MENU_ITEMS.find((i) => i.route === r)?.enabled(menuState(null))).toBe(true);
  });

  it('puts the Classic entries under an honest "Classic (original rules)" heading, routes unchanged', () => {
    const labels = MENU_ITEMS.map((i) => i.label);
    expect(labels.slice(3, 6)).toEqual(['Classic (original rules)', 'New Game', 'Continue']);
    expect(MENU_ITEMS[3]?.heading).toBe(true);
    expect(MENU_ITEMS.find((i) => i.label === 'New Game')?.route).toBe('newGame');
    expect(MENU_ITEMS.find((i) => i.label === 'Continue')?.route).toBe('battleground');
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
