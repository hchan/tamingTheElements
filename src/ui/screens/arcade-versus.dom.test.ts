// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { arcadePickView, arcadeResultsView, raceLabel, select, type PickValues } from './arcade-versus';
import type { CharacterId } from '@core/index';

const RACES = ['sindarosa', 'rokcore', 'lavax'] as CharacterId[];
const LEVELS = [{ value: '1', label: 'Level 1' }, { value: '2', label: 'Level 2' }];

afterEach(() => {
  document.body.replaceChildren();
});

function mount(onStart: (v: PickValues) => void = vi.fn(), current: Partial<PickValues> = {}): HTMLElement {
  const page = arcadePickView({
    races: RACES,
    levels: LEVELS,
    current: { player: 'sindarosa', enemy: 'rokcore', level: '2', size: '1', mode: 'ai', partner: 'rokcore', partner2: 'lavax', enemyPartner: 'rokcore', enemyPartner2: 'lavax', ...current },
    onStart,
  });
  document.body.append(page);
  return page;
}
const sel = (id: string): HTMLSelectElement => document.getElementById(id) as HTMLSelectElement;
const change = (s: HTMLSelectElement, v: string): void => {
  s.value = v;
  s.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('select / raceLabel', () => {
  it('builds a labelled select with id arcade<Name> and the current value selected', () => {
    document.body.append(select('size', 'Team', [{ value: '1', label: '1v1' }, { value: '2', label: '2v2' }], '2'));
    expect(sel('arcadeSize').value).toBe('2');
    expect(document.querySelector('label[for="arcadeSize"]')?.textContent).toBe('Team');
  });
  it('raceLabel names the element in words', () => {
    expect(raceLabel('sindarosa' as CharacterId)).toMatch(/\(.+\)$/);
  });
});

describe('arcadePickView (DOM)', () => {
  it('shows the 1v1 form: partners disabled, level enabled, local help hidden', () => {
    mount();
    expect(sel('arcadePartner').disabled).toBe(true);
    expect(sel('arcadePartner2').disabled).toBe(true);
    expect(sel('arcadeEnemyPartner').disabled).toBe(true);
    expect(sel('arcadeLevel').disabled).toBe(false);
    expect(document.getElementById('arcadeLocalHelp')?.hidden).toBe(true);
    expect(document.querySelector('label[for="arcadeEnemy"]')?.textContent).toBe('AI race');
  });

  it('Team size enables the partner(s): 2v2 the partner only, 3v3 both', () => {
    mount();
    change(sel('arcadeSize'), '2');
    expect(sel('arcadePartner').disabled).toBe(false);
    expect(sel('arcadePartner2').disabled).toBe(true);
    change(sel('arcadeSize'), '3');
    expect(sel('arcadePartner2').disabled).toBe(false);
  });

  it('choosing two players relabels, defaults to 3v3, hides the AI level and shows the key help and Player 2 rows', () => {
    mount();
    change(sel('arcadeMode'), 'local');
    expect(sel('arcadeSize').value).toBe('3');
    expect(sel('arcadeLevel').disabled).toBe(true);
    expect(sel('arcadeEnemyPartner').disabled).toBe(false);
    expect(sel('arcadeEnemyPartner2').disabled).toBe(false);
    expect(document.getElementById('arcadeLocalHelp')?.hidden).toBe(false);
    expect(document.querySelector('label[for="arcadeEnemy"]')?.textContent).toBe('Player 2 hero 1');
    expect(document.querySelector('label[for="arcadePlayer"]')?.textContent).toBe('Player 1 hero 1');
    expect(sel('arcadeEnemyPartner').closest<HTMLElement>('.settingsOption')?.style.display).toBe('');
    change(sel('arcadeMode'), 'ai');
    expect(sel('arcadeEnemyPartner').closest<HTMLElement>('.settingsOption')?.style.display).toBe('none');
  });

  // happy-dom's FormData includes disabled controls (browsers omit them), so "left out of the form data" is covered by e2e;
  // here the disabled flags (checked above) are what drive it.
  it('submit calls onStart with the picked values and prevents the page navigation', () => {
    const onStart = vi.fn();
    const page = mount(onStart);
    const ev = new Event('submit', { cancelable: true });
    page.querySelector('form')?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({ player: 'sindarosa', enemy: 'rokcore', level: '2', size: '1', mode: 'ai' });
  });

  it('submit with 3v3 carries both partners', () => {
    const onStart = vi.fn();
    const page = mount(onStart);
    change(sel('arcadeSize'), '3');
    change(sel('arcadePartner'), 'rokcore');
    change(sel('arcadePartner2'), 'lavax');
    page.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    const v = onStart.mock.calls[0]?.[0] as PickValues;
    expect(v.partner).toBe('rokcore');
    expect(v.partner2).toBe('lavax');
  });

  it('roster: a tile fills the active slot with aria-pressed, then advances to the next open slot', () => {
    mount(vi.fn(), { size: '2' });
    const tiles = [...document.querySelectorAll<HTMLButtonElement>('.rosterTile')];
    expect(tiles).toHaveLength(RACES.length);
    const slots = [...document.querySelectorAll<HTMLButtonElement>('.rosterSlot')];
    expect(slots[0]?.getAttribute('aria-pressed')).toBe('true');
    tiles[2]?.click();
    expect(sel('arcadePlayer').value).toBe('lavax');
    expect(tiles[2]?.getAttribute('aria-pressed')).toBe('false');
    expect(slots[1]?.getAttribute('aria-pressed')).toBe('true');
    tiles[1]?.click();
    expect(sel('arcadePartner').value).toBe('rokcore');
  });

  it('roster pills say which slot a hero fills in words', () => {
    mount();
    const pill = (i: number): HTMLElement | null => document.querySelectorAll<HTMLElement>('.rosterTile')[i]?.querySelector('.battlegroundOrderContainer') ?? null;
    expect(pill(0)?.textContent).toBe('Slot 1');
    expect(pill(0)?.hidden).toBe(false);
    expect(pill(2)?.hidden).toBe(true);
  });

  it('roster hides the hero pulldowns from the Tab order after a microtask', async () => {
    mount();
    await Promise.resolve();
    expect(sel('arcadePlayer').tabIndex).toBe(-1);
    expect(sel('arcadePlayer').closest('.settingsOption')?.classList.contains('srOnly')).toBe(true);
    expect(sel('arcadeLevel').closest('.settingsOption')?.classList.contains('srOnly')).toBe(false);
  });
});

describe('arcadeResultsView (DOM)', () => {
  it('renders heading, summary, wired buttons and a Main Menu link; Download only when recorded', () => {
    const calls: string[] = [];
    const page = arcadeResultsView({ heading: 'You win', summary: 'Won in 30s', onRematch: () => calls.push('r'), onChange: () => calls.push('c') });
    document.body.append(page);
    expect(page.querySelector('h1')?.textContent).toBe('You win');
    expect(page.querySelector('p')?.textContent).toBe('Won in 30s');
    document.getElementById('arcadeRematch')?.click();
    document.getElementById('arcadeChange')?.click();
    expect(calls).toEqual(['r', 'c']);
    expect(document.getElementById('downloadReplay')).toBeNull();
    expect(page.querySelector('a')?.getAttribute('href')).toBe('#main');
    const withDl = arcadeResultsView({ heading: 'h', summary: 's', onRematch: vi.fn(), onChange: vi.fn(), onDownload: () => calls.push('d') });
    document.body.append(withDl);
    withDl.querySelector<HTMLElement>('#downloadReplay')?.click();
    expect(calls.at(-1)).toBe('d');
  });
});
