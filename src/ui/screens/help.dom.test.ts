// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { setBindings, DEFAULT_BINDINGS } from '../../game/platform/input/bindings';
import { HELP_LINKS, helpScreen } from './help';

afterEach(() => {
  document.body.replaceChildren();
  setBindings(DEFAULT_BINDINGS);
});

describe('helpScreen (DOM)', () => {
  it('lists every help link with its route, a Back link to #main and a Controls section', () => {
    const root = document.createElement('div');
    document.body.append(root);
    helpScreen().mount(root);
    expect(root.querySelector('h1')?.textContent).toBe('Help');
    const items = [...root.querySelectorAll<HTMLElement>('li[data-route]')];
    expect(items.map((li) => li.dataset['route'])).toEqual(HELP_LINKS.map((l) => l.route));
    for (const l of HELP_LINKS) {
      const a = root.querySelector(`li[data-route="${l.route}"] a`);
      expect(a?.getAttribute('href')).toBe(`#${l.route}`);
      expect(a?.textContent).toBe(l.label);
    }
    expect(root.querySelector('a.menuLink')?.getAttribute('href')).toBe('#main');
    const sec = root.querySelector('section.helpControls');
    expect(sec?.getAttribute('aria-labelledby')).toBe('helpControlsHeading');
    expect(document.getElementById('helpControlsHeading')?.textContent).toBe('Controls');
  });

  it('has How to fight, the numbered action bar and the hero picker steps', () => {
    const root = document.createElement('div');
    helpScreen().mount(root);
    expect(root.querySelector('#helpLessonsHeading')?.textContent).toBe('How to fight');
    expect(root.querySelector('#helpPickerHeading')?.textContent).toBe('Choosing your heroes');
    const keys = [...root.querySelectorAll('.helpBar kbd')].map((k) => k.textContent);
    expect(keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']);
    expect(root.querySelector('.helpPicker')?.textContent).toMatch(/x button/);
  });

  it('every controls table has a caption, column headers with scope and row headers', () => {
    const root = document.createElement('div');
    helpScreen().mount(root);
    const tables = root.querySelectorAll('table');
    expect(tables.length).toBeGreaterThan(1);
    for (const t of tables) {
      expect(t.querySelector('caption')?.textContent).not.toBe('');
      expect([...t.querySelectorAll('thead th')].map((th) => th.getAttribute('scope'))).toEqual(['col', 'col']);
      for (const th of t.querySelectorAll('tbody th')) expect(th.getAttribute('scope')).toBe('row');
    }
  });

  it('shows the player bindings in effect at mount time', () => {
    setBindings({ ...DEFAULT_BINDINGS, dash: ['KeyV'] });
    const root = document.createElement('div');
    helpScreen().mount(root);
    const row = [...root.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('th')?.textContent === 'Dash');
    expect(row?.querySelector('td')?.textContent).toBe('V');
  });

  it('unmount removes the page', () => {
    const root = document.createElement('div');
    const s = helpScreen();
    s.mount(root);
    s.unmount();
    expect(root.children).toHaveLength(0);
    s.unmount();
  });
});
