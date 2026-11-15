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

  it('puts a Back link to #main right after the title as well as at the foot (QA r30)', () => {
    const root = document.createElement('div');
    document.body.append(root);
    helpScreen().mount(root);
    const backs = [...root.querySelectorAll<HTMLAnchorElement>('a.menuLink')];
    expect(backs).toHaveLength(2);
    expect(backs.every((a) => a.getAttribute('href') === '#main')).toBe(true);
    expect(root.querySelector('h1')?.nextElementSibling).toBe(backs[0]);
  });

  it('has a Jump to row whose buttons scroll to each section heading', () => {
    const root = document.createElement('div');
    document.body.append(root);
    helpScreen().mount(root);
    const btns = [...root.querySelectorAll<HTMLButtonElement>('nav.helpJump button')];
    expect(btns.map((b) => b.textContent)).toEqual([
      'How to fight',
      'Choosing your heroes',
      'Controls',
    ]);
    const target = document.getElementById('helpControlsHeading') as HTMLElement;
    let scrolled = 0;
    target.scrollIntoView = () => {
      scrolled++;
    };
    btns[2]?.click();
    expect(scrolled).toBe(1);
    expect(document.activeElement).toBe(target);
    expect(root.querySelector('nav.helpJump a')).toBeNull();
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
      expect([...t.querySelectorAll('thead th')].map((th) => th.getAttribute('scope'))).toEqual([
        'col',
        'col',
      ]);
      for (const th of t.querySelectorAll('tbody th')) expect(th.getAttribute('scope')).toBe('row');
    }
  });

  it('shows the player bindings in effect at mount time', () => {
    setBindings({ ...DEFAULT_BINDINGS, dash: ['KeyV'] });
    const root = document.createElement('div');
    helpScreen().mount(root);
    const row = [...root.querySelectorAll('tbody tr')].find(
      (tr) => tr.querySelector('th')?.textContent === 'Dash',
    );
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
