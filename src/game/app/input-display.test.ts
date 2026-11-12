// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Cmd } from '@core/index';
import { INPUT_BUTTONS, createInputDisplay, describeCommand, recentRuns } from './input-display';

describe('describeCommand', () => {
  it('shows no input as a dot', () => {
    expect(describeCommand(0)).toEqual({ text: '·', spoken: 'no input' });
  });

  it('names directions, diagonals and buttons', () => {
    expect(describeCommand(Cmd.up | Cmd.right | Cmd.primary | Cmd.secondary)).toEqual({
      text: '↗ A+B',
      spoken: 'up-right, attack, special',
    });
    expect(describeCommand(Cmd.left).text).toBe('←');
    expect(describeCommand(Cmd.down | Cmd.left).spoken).toBe('down-left');
    expect(describeCommand(Cmd.capture).spoken).toBe('snag');
  });

  it('cancels opposing directions', () => {
    expect(describeCommand(Cmd.left | Cmd.right).text).toBe('·');
    expect(describeCommand(Cmd.up | Cmd.down | Cmd.primary).text).toBe('A');
  });

  it('keeps the button table in step with Cmd and never uses the retired words', () => {
    const bits = [Cmd.primary, Cmd.secondary, Cmd.capture, Cmd.swap1, Cmd.swap2, Cmd.swap3, Cmd.swap4, Cmd.dash, Cmd.guard, Cmd.super, Cmd.weather, Cmd.charge];
    expect(INPUT_BUTTONS.map((b) => b.bit)).toEqual(bits);
    expect(new Set(INPUT_BUTTONS.map((b) => b.label)).size).toBe(INPUT_BUTTONS.length);
    expect(INPUT_BUTTONS.map((b) => b.name).join(' ')).not.toMatch(/classic|arcade|ruleset|capture/i);
    expect(Cmd.up | Cmd.down | Cmd.left | Cmd.right).toBe(15);
  });
});

describe('recentRuns', () => {
  const rle = [0, 3, 4, 2, 4, 1, 16, 5]; // 3 idle, 3 left (two entries merge), 5 attack

  it('returns the newest runs first, cut at the current tick', () => {
    expect(recentRuns(rle, 3, 8)).toEqual([{ cmd: 0, ticks: 3 }]);
    expect(recentRuns(rle, 5, 8)).toEqual([{ cmd: 4, ticks: 2 }, { cmd: 0, ticks: 3 }]);
    expect(recentRuns(rle, 99, 8)).toEqual([{ cmd: 16, ticks: 5 }, { cmd: 4, ticks: 3 }, { cmd: 0, ticks: 3 }]);
  });

  it('limits the rows and handles tick 0 and empty streams', () => {
    expect(recentRuns(rle, 99, 1)).toEqual([{ cmd: 16, ticks: 5 }]);
    expect(recentRuns(rle, 0, 8)).toEqual([]);
    expect(recentRuns([], 10, 8)).toEqual([]);
  });
});

describe('createInputDisplay', () => {
  const rows = (d: ReturnType<typeof createInputDisplay>, id: string): string[] =>
    [...d.root.querySelectorAll(`#${id} li`)].map((li) => li.textContent);

  it('is a labelled group with a list per player', () => {
    const d = createInputDisplay();
    expect(d.root.getAttribute('role')).toBe('group');
    expect(d.root.getAttribute('aria-label')).toBe('Input display');
    expect(d.root.querySelectorAll('ol[aria-label]')).toHaveLength(2);
  });

  it('follows the tick for both players and labels each row', () => {
    const d = createInputDisplay();
    d.setInputs([[0, 2, 24, 3], [8, 5]]);
    expect(rows(d, 'inputList1')).toEqual([]);
    d.update(4);
    expect(rows(d, 'inputList1')).toEqual(['→ A×2', '·×2']);
    expect(rows(d, 'inputList2')).toEqual(['→×4']);
    expect(d.root.querySelector('#inputList1 li')?.getAttribute('aria-label')).toBe('right, attack, 2 ticks');
    expect(d.root.querySelector('#inputList1 li')?.classList.contains('inputNow')).toBe(true);
  });

  it('can be hidden, catches up when shown and clears without streams', () => {
    const d = createInputDisplay();
    d.setInputs([[0, 2], [8, 5]]);
    d.setVisible(false);
    expect(d.root.hidden).toBe(true);
    d.update(2);
    expect(rows(d, 'inputList2')).toEqual([]);
    d.setVisible(true);
    expect(rows(d, 'inputList2')).toEqual(['→×2']);
    d.setInputs(undefined);
    expect(rows(d, 'inputList2')).toEqual([]);
  });
});
