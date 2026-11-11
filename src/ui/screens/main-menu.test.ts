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
      arcade: false,
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

describe('Arcade Versus entry', () => {
  const arcade = MENU_ITEMS.find((i) => i.route === 'arcade');
  const listed = (save: Parameters<typeof menuState>[0], search = ''): string[] =>
    MENU_ITEMS.filter((i) => i.shown?.(menuState(save, search)) !== false).map((i) => i.label);

  it('is left out of the menu by default, so the Classic menu is unchanged', () => {
    expect(listed(null)).not.toContain('Arcade Versus');
    expect(listed({ ...newEmptyState(), arcadePreview: false })).toEqual(listed(null));
    expect(listed({ ...newEmptyState(), arcadePreview: 'yes' })).toEqual(listed(null));
  });

  it('is listed (and enabled without a save) with the Settings opt-in or ?ff=arcade', () => {
    expect(listed({ ...newEmptyState(), arcadePreview: true })).toContain('Arcade Versus');
    expect(listed(null, '?ff=arcade')).toContain('Arcade Versus');
    expect(listed(null, '?ff=arenaDemo')).not.toContain('Arcade Versus');
    expect(arcade?.enabled(menuState(null, '?ff=arcade'))).toBe(true);
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

describe('Online Versus entry', () => {
  it('follows the Arcade preview gate, so the Classic menu is unchanged', () => {
    const online = MENU_ITEMS.find((i) => i.route === 'online');
    expect(online?.shown?.(menuState(null, ''))).toBe(false);
    expect(online?.shown?.(menuState(null, '?ff=arcade'))).toBe(true);
  });
});

describe('World Tour entry', () => {
  it('follows the Arcade preview gate and sits after Online Versus', () => {
    const tour = MENU_ITEMS.find((i) => i.route === 'tour');
    expect(tour?.label).toBe('World Tour (preview)');
    expect(tour?.shown?.(menuState(null, ''))).toBe(false);
    expect(tour?.shown?.(menuState(null, '?ff=arcade'))).toBe(true);
    expect(MENU_ITEMS.findIndex((i) => i.route === 'tour')).toBe(MENU_ITEMS.findIndex((i) => i.route === 'online') + 1);
  });
});
