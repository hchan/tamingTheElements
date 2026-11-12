import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, bindSteal } from '../../game/platform/input/bindings';
import { controlSections, player1Rows } from './help-controls';

const BANNED = /classic|arcade|ruleset|capture/i;

describe('help controls', () => {
  it('lists the default Player 1 keys including Trap, Dash, Guard, Weather, Charge, Super, Tag', () => {
    const rows = Object.fromEntries(player1Rows(DEFAULT_BINDINGS).map((r) => [r.action, r.keys]));
    expect(rows['Trap']).toBe('Z or 0');
    expect(rows['Dash']).toBe('E or 7');
    expect(rows['Guard (hold)']).toBe('Q or 8');
    expect(rows['Weather']).toBe('R or 6');
    expect(rows['Charge']).toBe('H or 5');
    expect(rows['Super']).toBe('X or 9');
    expect(rows['Tag']).toBe('3');
  });
  it('shows rebinds', () => {
    const rows = player1Rows(bindSteal(DEFAULT_BINDINGS, 'trap', 0, 'KeyP'));
    expect(rows.find((r) => r.action === 'Trap')?.keys).toBe('P or 0');
  });
  it('has the five input sections and never shows forbidden words', () => {
    const sections = controlSections(DEFAULT_BINDINGS);
    expect(sections).toHaveLength(5);
    const text = sections.flatMap((s) => [s.title, ...s.rows.flatMap((r) => [r.action, r.keys])]).join(' | ');
    expect(text).not.toMatch(BANNED);
  });
});
