import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, rebind } from '../platform/input/bindings';
import { tourKeysDesktop, tourKeysTouch } from './tour-controls';

const caps = (rows: ReturnType<typeof tourKeysDesktop>): string[] => rows.flat().flatMap((c) => c.keys);
const actions = (rows: ReturnType<typeof tourKeysDesktop>): string[] => rows.flat().map((c) => c.action);
const BANNED = /classic|arcade|ruleset|capture/i;

describe('tourKeysDesktop', () => {
  it('default bindings: two rows, the numbered action keys, arrows noted', () => {
    const rows = tourKeysDesktop(DEFAULT_BINDINGS, 'sindarosa', true);
    expect(rows).toHaveLength(2);
    expect(caps(rows)).toEqual(['W', 'A', 'S', 'D', '1', '2', 'C', '7', '8', '9', '`', 'Tab', '3', '4']);
    expect(actions(rows)).toEqual(['Move', 'Blast', 'Flame', 'Snag', 'Dash', 'Guard (hold)', 'Super', 'Run', 'Tag']);
    expect(rows[0]?.[3]).toEqual({ keys: ['C'], action: 'Snag' });
    expect(rows[0]?.[0]?.note).toBe('(or arrows)');
  });

  it("shows the lead's own Snag box as slot key plus C", () => {
    const echo = tourKeysDesktop(DEFAULT_BINDINGS, 'echo', true)[0] ?? [];
    expect(echo[1]).toEqual({ keys: ['1', 'C'], action: 'Snag' });
    expect(echo.filter((c) => c.action === 'Snag')).toHaveLength(1);
    const curomo = tourKeysDesktop(DEFAULT_BINDINGS, 'curomo', true)[0] ?? [];
    expect(curomo[2]).toEqual({ keys: ['2', 'C'], action: 'Snag' });
  });

  it('falls back to Attack and Second attack for an unknown lead', () => {
    expect(actions(tourKeysDesktop(DEFAULT_BINDINGS, undefined, false)).slice(1, 3)).toEqual(['Attack', 'Second attack']);
  });

  it('leaves Snag out when no hero can throw it', () => {
    const rows = tourKeysDesktop(DEFAULT_BINDINGS, 'sindarosa', false);
    expect(actions(rows)).not.toContain('Snag');
    expect(caps(rows)).not.toContain('C');
  });

  it('shows rebound keys, arrow glyphs and unbound', () => {
    const b = rebind(rebind(rebind(DEFAULT_BINDINGS, 'up', ['ArrowUp']), 'left', []), 'dash', ['KeyF']);
    const rows = tourKeysDesktop(b, 'sindarosa', true);
    expect(rows[0]?.[0]?.keys).toEqual(['↑', 'unbound', 'S', 'D']);
    expect(rows[0]?.[0]?.note).toBeUndefined();
    expect(rows[1]?.[0]?.keys).toEqual(['F']);
  });

  it('never shows a banned word', () => {
    for (const [lead, snag] of [['sindarosa', true], ['echo', true], ['sindarosa', false], [undefined, false]] as const) {
      const text = tourKeysDesktop(DEFAULT_BINDINGS, lead, snag).flat().map((c) => [...c.keys, c.action, c.note ?? ''].join(' ')).join(' ');
      expect(text).not.toMatch(BANNED);
      expect(text).not.toMatch(/Strike|Special/);
    }
  });
});

describe('tourKeysTouch', () => {
  it('names the stick, the strike buttons and the bar', () => {
    const rows = tourKeysTouch(true);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([{ keys: ['Stick'], action: 'Move' }, { keys: ['1', '2'], action: 'Strike' }]);
    expect(rows[1]?.flatMap((c) => c.keys)).toEqual(['Dash', 'Guard', 'Super', 'Run', 'Tag', 'Snag']);
  });

  it('leaves Snag out without a Snag hero, and uses no banned word', () => {
    expect(tourKeysTouch(false)[1]?.flatMap((c) => c.keys)).toEqual(['Dash', 'Guard', 'Super', 'Run', 'Tag']);
    const text = tourKeysTouch(true).flat().map((c) => [...c.keys, c.action].join(' ')).join(' ');
    expect(text).not.toMatch(BANNED);
  });
});
