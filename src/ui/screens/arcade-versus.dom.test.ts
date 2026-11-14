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

  it('explains the lower tag-team life only for 2v2 and 3v3', () => {
    mount();
    const h = (): HTMLElement | null => document.getElementById('arcadeTeamHint');
    expect(h()?.hidden).toBe(true);
    change(sel('arcadeSize'), '2');
    expect(h()?.hidden).toBe(false);
    expect(h()?.textContent).toMatch(/less life/);
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

  it('offers an Arena choice (Random first) that submits with the form and is click operable', () => {
    const onStart = vi.fn();
    const page = mount(onStart);
    const group = page.querySelector('label[for="arcadeStage"]')?.closest('.settingsOption');
    expect(group?.textContent).toMatch(/Random.*Fire.*Water.*Earth.*Air/);
    expect(sel('arcadeStage').value).toBe('');
    const water = [...(group?.querySelectorAll<HTMLButtonElement>('.vsSegment') ?? [])].find((b) => b.dataset['value'] === 'water');
    water?.click();
    expect(water?.getAttribute('aria-checked')).toBe('true');
    page.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({ stage: 'water' });
  });

  it('shows the remembered stage and never uses the banned words', () => {
    const page = mount(vi.fn(), { stage: 'air' });
    expect(sel('arcadeStage').value).toBe('air');
    expect(page.textContent).not.toMatch(/Classic|Arcade|ruleset|Capture/);
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
    const tiles = [...document.querySelectorAll<HTMLButtonElement>('.heroTile')];
    expect(tiles).toHaveLength(RACES.length);
    const slots = [...document.querySelectorAll<HTMLButtonElement>('.rosterSlot')];
    expect(slots[0]?.getAttribute('aria-pressed')).toBe('true');
    tiles[2]?.click();
    // Tiles are grouped by element (fire before earth), so the order is sindarosa, lavax, rokcore.
    expect(sel('arcadePlayer').value).toBe('rokcore');
    expect(tiles[2]?.getAttribute('aria-pressed')).toBe('true');
    expect(slots[1]?.getAttribute('aria-pressed')).toBe('true');
    tiles[1]?.click();
    expect(sel('arcadePartner').value).toBe('lavax');
  });

  it('a team never holds a hero twice: the keyboard pick of a hero already in another slot moves it', () => {
    mount(vi.fn(), { size: '2' });
    const tiles = [...document.querySelectorAll<HTMLButtonElement>('.heroTile')];
    tiles[2]?.click(); // rokcore into slot 1
    tiles[1]?.click(); // lavax into slot 2
    document.getElementById('roster-player')?.click(); // slot 1 active; the cursor rests on lavax
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true })); // cursor to rokcore (picked in slot 1)
    document.getElementById('roster-partner')?.click();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(new Set([sel('arcadePlayer').value, sel('arcadePartner').value]).size).toBe(2);
    expect(sel('arcadePartner').value).toBe('rokcore');
    expect(sel('arcadePlayer').value).toBe('lavax');
  });

  it('Clear returns focus to the slot and the next pick refills the first empty slot', () => {
    mount(vi.fn(), { size: '2' });
    const tiles = [...document.querySelectorAll<HTMLButtonElement>('.heroTile')];
    tiles[2]?.click();
    tiles[1]?.click();
    const clears = [...document.querySelectorAll<HTMLElement>('.vsSlotActions .vsSmall')].filter((b) => b.textContent === 'Clear');
    clears[0]?.click();
    expect(sel('arcadePlayer').value).toBe('');
    expect(document.activeElement).toBe(document.getElementById('roster-player'));
    tiles[0]?.click();
    expect(sel('arcadePlayer').value).toBe('sindarosa');
  });

  it('a picked hero carries a P1 chip with its slot number, as text', () => {
    mount();
    const flags = (i: number): HTMLElement | null => document.querySelectorAll<HTMLElement>('.heroTile')[i]?.querySelector('.vsFlags') ?? null;
    expect(flags(0)?.hidden).toBe(true);
    document.querySelectorAll<HTMLButtonElement>('.heroTile')[2]?.click();
    expect(flags(2)?.hidden).toBe(false);
    expect(flags(2)?.textContent).toContain('You 1');
  });

  it('local mode: both players pick at once with their own keys and ready up', () => {
    mount(vi.fn(), { size: '1' });
    change(sel('arcadeMode'), 'local');
    change(sel('arcadeSize'), '1');
    const key = (code: string): void => {
      document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
    };
    // P1 cursor starts on hero 0 and P2's on hero 1.
    key('KeyD');
    key('Space');
    expect(sel('arcadePlayer').value).toBe('lavax');
    key('KeyL');
    key('KeyU');
    expect(sel('arcadeEnemy').value).toBe('rokcore');
    const ready1 = document.getElementById('ready-p1') as HTMLButtonElement;
    const ready2 = document.getElementById('ready-p2') as HTMLButtonElement;
    ready1.click();
    expect(ready1.getAttribute('aria-pressed')).toBe('true');
    key('KeyU');
    expect(ready2.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.vsStage')?.classList.contains('vsBothReady')).toBe(true);
    // Undo clears the last pick and the ready state.
    key('KeyQ');
    expect(ready1.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.vsStatus')?.textContent).toBe('Pick your fighter');
  });

  it('3v3: slots fill in order, Swap up reorders and Clear empties a slot', () => {
    mount();
    change(sel('arcadeMode'), 'local');
    const tiles = [...document.querySelectorAll<HTMLButtonElement>('.heroTile')];
    tiles[0]?.click();
    tiles[1]?.click();
    tiles[2]?.click();
    expect([sel('arcadePlayer').value, sel('arcadePartner').value, sel('arcadePartner2').value]).toEqual(['sindarosa', 'lavax', 'rokcore']);
    (document.querySelector('button[aria-label="Swap Player 1 pick 2 up to position 1"]') as HTMLButtonElement).click();
    expect([sel('arcadePlayer').value, sel('arcadePartner').value]).toEqual(['lavax', 'sindarosa']);
    (document.querySelector('button[aria-label="Clear Player 1 pick 3"]') as HTMLButtonElement).click();
    expect(document.querySelector('.vsStatus')?.textContent).toBe('2 of 3 picked');
  });

  it('the AI level row only shows against the computer', () => {
    mount();
    const row = sel('arcadeLevel').closest<HTMLElement>('.settingsOption');
    expect(row?.style.display).toBe('');
    change(sel('arcadeMode'), 'local');
    expect(row?.style.display).toBe('none');
  });

  it('roster hides the hero pulldowns from the Tab order after a microtask', async () => {
    mount();
    await Promise.resolve();
    expect(sel('arcadePlayer').tabIndex).toBe(-1);
    expect(sel('arcadePlayer').closest('.settingsOption')?.classList.contains('srOnly')).toBe(true);
    expect(sel('arcadeLevel').closest('.settingsOption')?.classList.contains('srOnly')).toBe(false);
  });

  it('the hidden hero pulldowns are aria-hidden (the grid is the control); the level pulldown is not', async () => {
    mount();
    await Promise.resolve();
    expect(sel('arcadePlayer').closest('.settingsOption')?.getAttribute('aria-hidden')).toBe('true');
    expect(sel('arcadeLevel').closest('.settingsOption')?.hasAttribute('aria-hidden')).toBe(false);
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
