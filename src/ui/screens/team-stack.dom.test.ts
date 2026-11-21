// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rowLabel, teamStack } from './team-stack';
import type { StackRow, TeamStackProps } from './team-stack';

afterEach(() => {
  document.body.replaceChildren();
});

const pax = { id: 'pax', name: 'Pax', abilities: [{ mark: 'Q', title: 'Quake' }] };
const curomo = { id: 'curomo', name: 'Curomo' };

function make(rows: StackRow[], extra: Partial<TeamStackProps> = {}) {
  const onRowClick = vi.fn();
  const onRowRemove = vi.fn();
  const s = teamStack({
    side: 'P1',
    rows,
    aimed: false,
    ready: false,
    onRowClick,
    onRowRemove,
    ...extra,
  });
  document.body.append(s.el);
  return { s, onRowClick, onRowRemove };
}

function props(rows: StackRow[], extra: Partial<TeamStackProps> = {}): TeamStackProps {
  return {
    side: 'P1',
    rows,
    aimed: false,
    ready: false,
    onRowClick: vi.fn(),
    onRowRemove: vi.fn(),
    ...extra,
  };
}

const rows3: StackRow[] = [
  { state: 'mine', hero: pax, id: 'roster-player', pressed: true },
  { state: 'suggested', hero: curomo, id: 'roster-partner' },
  { state: 'empty', id: 'roster-partner2' },
];

function at<T>(list: ArrayLike<T>, i: number): T {
  const v = list[i];
  if (v === undefined) throw new Error(`missing item ${String(i)}`);
  return v;
}

function btn(s: { el: HTMLElement }, i: number): HTMLButtonElement {
  return at(s.el.querySelectorAll<HTMLButtonElement>('.tsRow'), i);
}

function key(target: Element, k: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

describe('teamStack', () => {
  it('renders numbered rows with roles, ids and list roles', () => {
    const { s } = make(rows3);
    expect(s.el.querySelector('ul')?.getAttribute('role')).toBe('list');
    expect(s.el.querySelectorAll('[role=listitem]').length).toBe(3);
    const text = [...s.el.querySelectorAll('.tsRow')].map(
      (r) =>
        `${r.querySelector('.tsNum')?.textContent ?? ''} ${r.querySelector('.tsRole')?.textContent ?? ''}`,
    );
    expect(text).toEqual(['1 Starter', '2 Tag', '3 Tag']);
    expect(document.getElementById('roster-partner2')).not.toBeNull();
    expect(s.el.querySelectorAll('.rosterSlot').length).toBe(3);
    expect(s.el.querySelector('.vsAbilities .vsAbility')?.getAttribute('title')).toBe('Quake');
  });

  it('labels mine, suggested and empty rows', () => {
    const { s } = make(rows3);
    const labels = [...s.el.querySelectorAll('.tsRow')].map((r) => r.getAttribute('title'));
    expect(labels).toEqual([
      'Remove Pax from slot 1 (Starter). Q Quake',
      'Slot 2, Tag, suggested Curomo',
      'Slot 3, Tag, empty',
    ]);
    expect(rowLabel(at(rows3, 1), 1)).toBe(labels[1]);
  });

  it('marks suggested rows with the word Suggested and a Remove affordance only on mine', () => {
    const { s } = make(rows3);
    const a = btn(s, 0);
    const b = btn(s, 1);
    expect(b.textContent).toContain('Suggested');
    expect(b.classList.contains('tsSuggested')).toBe(true);
    expect(b.querySelector('.tsRemove')).toBeNull();
    expect(a.textContent).toContain('Remove');
    expect(a.textContent).not.toContain('Suggested');
  });

  it('has exactly one aria-pressed row', () => {
    const { s } = make(rows3);
    expect(s.el.querySelectorAll('[aria-pressed=true]').length).toBe(1);
  });

  it('shows Aimed and Ready as text and aria-current', () => {
    const { s } = make(rows3);
    expect(s.el.querySelector<HTMLElement>('.tsAim')?.hidden).toBe(true);
    expect(s.el.hasAttribute('aria-current')).toBe(false);
    s.update(props(rows3, { side: 'P2', aimed: true, ready: true }));
    expect(s.el.querySelector<HTMLElement>('.tsAim')?.hidden).toBe(false);
    expect(s.el.querySelector<HTMLElement>('.tsReady')?.hidden).toBe(false);
    expect(s.el.getAttribute('aria-current')).toBe('true');
    expect(s.el.getAttribute('aria-label')).toBe('P2 heroes, aimed, ready');
  });

  it('hides and disables hidden rows, and trims rows on update', () => {
    const first = at(rows3, 0);
    const { s } = make([first, { state: 'empty', hidden: true, id: 'x' }]);
    expect(at(s.el.querySelectorAll<HTMLLIElement>('.tsItem'), 1).hidden).toBe(true);
    expect(btn(s, 1).disabled).toBe(true);
    s.update(props([first]));
    expect(s.el.querySelectorAll('.tsItem').length).toBe(1);
  });

  it('click calls onRowClick with the index; disabled rows do not', () => {
    const { s, onRowClick } = make([...rows3, { state: 'empty', hidden: true }]);
    btn(s, 1).click();
    expect(onRowClick).toHaveBeenCalledWith(1);
    btn(s, 3).click();
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('Delete and Backspace on a focused mine row remove it; other rows ignore them', () => {
    const { s, onRowRemove } = make(rows3);
    key(btn(s, 0), 'Delete');
    key(btn(s, 0), 'Backspace');
    expect(onRowRemove).toHaveBeenCalledTimes(2);
    expect(onRowRemove).toHaveBeenLastCalledWith(0);
    key(btn(s, 1), 'Delete');
    key(btn(s, 2), 'Delete');
    expect(onRowRemove).toHaveBeenCalledTimes(2);
  });
});
