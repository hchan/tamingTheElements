import { describe, expect, it } from 'vitest';
import { newEmptyState } from '@core/menu-index';
import { DEFAULT_BINDINGS, GAME_ACTIONS, rebind, sameBindings } from '../../game/platform/input/bindings';
import { bindingsFromSave, formatKeys, KEY_BINDINGS, saveWithBindings } from './key-bindings';

describe('key bindings in the save', () => {
  it('default bindings leave no keyBindings entry in the save', () => {
    const save = saveWithBindings(newEmptyState(), DEFAULT_BINDINGS);
    expect(save.keyBindings).toBeUndefined();
    expect('keyBindings' in save).toBe(false);
  });

  it('a custom binding round-trips through the save', () => {
    const action = GAME_ACTIONS[0];
    const custom = rebind(DEFAULT_BINDINGS, action, ['KeyQ']);
    const save = saveWithBindings(newEmptyState(), custom);
    expect(save.keyBindings).toBeDefined();
    expect(sameBindings(bindingsFromSave(save), custom)).toBe(true);
  });

  it('resetting to defaults removes a previously stored customisation and does not mutate the input save', () => {
    const action = GAME_ACTIONS[0];
    const custom = saveWithBindings(newEmptyState(), rebind(DEFAULT_BINDINGS, action, ['KeyQ']));
    const before = JSON.stringify(custom);
    const reset = saveWithBindings(custom, DEFAULT_BINDINGS);
    expect(reset.keyBindings).toBeUndefined();
    expect(JSON.stringify(custom)).toBe(before);
  });

  it('a missing or corrupt stored value falls back to the defaults', () => {
    expect(sameBindings(bindingsFromSave(null), DEFAULT_BINDINGS)).toBe(true);
    expect(sameBindings(bindingsFromSave(newEmptyState()), DEFAULT_BINDINGS)).toBe(true);
    const corrupt = { ...newEmptyState(), keyBindings: 'garbage' } as never;
    expect(sameBindings(bindingsFromSave(corrupt), DEFAULT_BINDINGS)).toBe(true);
  });
});

describe('system key list', () => {
  it('formatKeys joins alternatives with "or"', () => {
    expect(formatKeys(['A'])).toBe('A');
    expect(formatKeys(['A', 'B'])).toBe('A or B');
  });

  it('omits debug cheats from the player-facing list', () => {
    const text = KEY_BINDINGS.map((b) => `${b.action} ${b.keys.join(' ')}`).join(' ');
    expect(text).not.toMatch(/I Win|Freeze|CaptureWin/i);
  });
});
