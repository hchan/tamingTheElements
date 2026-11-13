import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../../game/platform/input/bindings';
import { LESSONS, PICKER_STEPS, actionBarKeys } from './help-guide';

describe('help guide data', () => {
  it('the action bar is 1-9, 0, -, = in order with the default bindings', () => {
    expect(actionBarKeys(DEFAULT_BINDINGS).map((k) => k.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']);
    expect(actionBarKeys(DEFAULT_BINDINGS).map((k) => k.name)).toEqual([
      'Attack', 'Second attack', 'Tag', 'Tag 2', 'Charge', 'Weather', 'Dash', 'Guard', 'Super', 'Trap', 'Element', 'Cleanse',
    ]);
  });

  it('a rebind that drops the digit shows the first key; an empty binding shows unbound', () => {
    const keys = actionBarKeys({ ...DEFAULT_BINDINGS, dash: ['KeyV'], guard: [] });
    expect(keys.find((k) => k.name === 'Dash')?.key).toBe('V');
    expect(keys.find((k) => k.name === 'Guard')?.key).toBe('unbound');
  });

  it('covers every lesson the idea names and the picker remove paths, without banned words', () => {
    const titles = LESSONS.map((l) => l.title).join(' ');
    for (const w of ['Move', 'Attack', 'Dash', 'Guard', 'Charge', 'Weather', 'Super', 'Tag']) expect(titles).toContain(w);
    const picker = PICKER_STEPS.join(' ');
    expect(picker).toMatch(/x button/);
    expect(picker).toMatch(/Delete/);
    expect(picker).toMatch(/Drag/);
    expect(picker).toMatch(/gamepad/);
    expect(`${titles} ${LESSONS.map((l) => l.text).join(' ')} ${picker}`).not.toMatch(/classic|arcade|ruleset|capture/i);
  });
});
