// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { setBindings, DEFAULT_BINDINGS } from '../../game/platform/input/bindings';
import { FIRE_BLAST_FALLOFF, SNAG_DESCRIPTION, SNAG_NAME } from '@core/menu-index';
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
      'Controls',
      'Choosing your heroes',
      'Ways to play',
      'Reading the arena',
    ]);
    const target = document.getElementById('helpControlsHeading') as HTMLElement;
    let scrolled = 0;
    target.scrollIntoView = () => {
      scrolled++;
    };
    const det = target.closest('details') as HTMLDetailsElement;
    expect(det.hasAttribute('open')).toBe(false);
    btns[1]?.click();
    expect(scrolled).toBe(1);
    expect(det.hasAttribute('open')).toBe(true);
    expect(document.activeElement).toBe(target);
    expect(root.querySelector('nav.helpJump a')).toBeNull();
  });

  it('has How to fight, the numbered action bar and the hero picker steps', () => {
    const root = document.createElement('div');
    helpScreen().mount(root);
    expect(root.querySelector('#helpLessonsHeading')?.textContent).toBe('How to fight');
    expect(root.querySelector('#helpPickerHeading')?.textContent).toBe('Choosing your heroes');
    const keys = [...root.querySelectorAll('.helpBar kbd')].map((k) => k.textContent);
    expect(keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '`']);
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

  it('names the Keyboard Player 1, Player 2 and Gamepad tables, and has no Touch table (moved from help-controls e2e)', () => {
    const root = document.createElement('div');
    helpScreen().mount(root);
    const names = [...root.querySelectorAll('table caption')].map((c) => c.textContent);
    expect(names).toContain('Keyboard, Player 1');
    expect(names.some((n) => /Player 2/.test(n))).toBe(true);
    expect(names).toContain('Gamepad');
    expect(names.some((n) => /touch/i.test(n))).toBe(false);
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

  it('has five collapsible sections with the planned defaults, ids and Back to top buttons', () => {
    const root = document.createElement('div');
    document.body.append(root);
    helpScreen().mount(root);
    const secs = [...root.querySelectorAll('section')];
    expect(secs.map((s) => s.querySelector('details')?.hasAttribute('open'))).toEqual([true, false, false, false, false]);
    for (const id of ['helpLessonsHeading', 'helpModesHeading', 'helpArenaHeading', 'helpPickerHeading', 'helpControlsHeading']) {
      const h = document.getElementById(id);
      expect(h?.tagName).toBe('H2');
      expect(h?.closest('section')?.getAttribute('aria-labelledby')).toBe(id);
      expect(h?.parentElement?.tagName).toBe('SUMMARY');
    }
    expect(root.querySelectorAll('button.helpTop')).toHaveLength(5);
    expect(root.querySelectorAll('a.menuLink')).toHaveLength(2);
  });

  it('names symbol keys: the - chip is minus, the Element row says (minus), 0 and V stay plain', () => {
    const root = document.createElement('div');
    helpScreen().mount(root);
    const bar = [...root.querySelectorAll<HTMLElement>('.helpBar kbd')];
    expect(bar.find((k) => k.textContent === '-')?.title).toBe('minus');
    expect(bar.find((k) => k.textContent === '=')?.title).toBe('equals');
    const row = [...root.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('th')?.textContent === 'Element');
    expect(row?.querySelector('td')?.textContent).toBe('V or - (minus)');
    const trap = [...root.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('th')?.textContent === 'Trap');
    expect(trap?.querySelector('td')?.textContent).toBe('Z or 0');
  });

  it('explains the ways to play and the arena in words, without banned words, in open or closed sections', () => {
    const root = document.createElement('div');
    document.body.append(root);
    helpScreen().mount(root);
    const text = document.body.textContent;
    expect(text).not.toMatch(/classic|arcade|ruleset|capture/i);
    for (const w of ['World Tour', 'Versus', 'Online', '2v2', '3v3', SNAG_NAME, SNAG_DESCRIPTION, 'FIRE x2', 'WATER +HP', 'ROCK', 'AIR x2', 'HEAL', 'ROCK PASS', FIRE_BLAST_FALLOFF]) {
      expect(text).toContain(w);
    }
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
