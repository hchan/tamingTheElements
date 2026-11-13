// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CharacterId } from '@core/index';
import { arcadePickView } from './arcade-versus';
import { tourPickView } from './tour';

afterEach(() => {
  document.body.replaceChildren();
});

const RACES = ['sindarosa', 'rokcore', 'lavax'] as CharacterId[];
const sel = (id: string): HTMLSelectElement => document.getElementById(id) as HTMLSelectElement;
const tile = (name: string): HTMLElement =>
  [...document.querySelectorAll<HTMLElement>('.heroTile')].find((t) => t.querySelector('.heroTileName')?.textContent === name) as HTMLElement;
const slotEl = (key: string): HTMLElement => document.querySelector(`[data-hero-slot="${key}"]`) as HTMLElement;
const panelName = (): string | null | undefined => document.querySelector('.heroPanel .heroName')?.textContent;

/** A pointer click: like a real mouse or touch click, `detail` is 1 (a keyboard activation has detail 0). */
const click = (n: Element): void => {
  n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
};
const ptr = (type: string, target: Element, x: number, y: number): void => {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, isPrimary: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y }),
  );
};
/** Press on `from`, drag over `to` (or nowhere), release; optionally stop mid-drag. */
const drag = (from: Element, to: Element | null, release = true): void => {
  ptr('pointerdown', from, 10, 10);
  ptr('pointermove', to ?? document.body, 60, 60);
  if (release) ptr('pointerup', to ?? document.body, 60, 60);
};

describe('Play picker: click previews, second click or Add assigns', () => {
  const mount = (): void => {
    document.body.append(tourPickView({ races: RACES, current: ['sindarosa', 'rokcore', 'lavax'], onStart: vi.fn() }));
    // happy-dom mis-reports preselected options: set the team explicitly.
    ['sindarosa', 'rokcore', 'lavax'].forEach((v, i) => {
      sel(`arcadeHero${String(i + 1)}`).value = v;
    });
  };

  it('a first pointer click only previews: the panel shows the hero, no slot changes', () => {
    mount();
    click(tile('Lavax'));
    expect(panelName()).toBe('Lavax');
    expect(document.querySelectorAll('.heroPanel .heroAbility').length).toBeGreaterThan(0);
    expect(sel('arcadeHero1').value).toBe('sindarosa');
    expect(tile('Lavax').classList.contains('heroArmed')).toBe(true);
  });

  it('a second click on the same tile assigns it to the active slot', () => {
    mount();
    click(tile('Lavax'));
    click(tile('Lavax'));
    expect(sel('arcadeHero1').value).toBe('lavax');
    expect(sel('arcadeHero3').value).toBe('sindarosa');
    expect(tile('Lavax').classList.contains('heroArmed')).toBe(false);
  });

  it('the Add to team button assigns the previewed hero, even after the pointer wandered over other tiles', () => {
    mount();
    click(tile('Rokcore'));
    tile('Lavax').dispatchEvent(new Event('pointerenter'));
    expect(panelName()).toBe('Rokcore');
    click(document.querySelector('.heroAdd') as Element);
    expect(sel('arcadeHero1').value).toBe('rokcore');
    expect(new Set(['arcadeHero1', 'arcadeHero2', 'arcadeHero3'].map((i) => sel(i).value)).size).toBe(3);
  });

  it('keyboard activation (detail 0) still assigns straight away', () => {
    mount();
    tile('Lavax').click();
    expect(sel('arcadeHero1').value).toBe('lavax');
  });

  it('tap fallback: preview a hero, then tap a slot', () => {
    mount();
    click(tile('Lavax'));
    click(document.getElementById('tourSlot2') as Element);
    expect(sel('arcadeHero2').value).toBe('lavax');
    expect(sel('arcadeHero3').value).toBe('rokcore');
  });
});

describe('Play picker: drag and drop', () => {
  const mount = (): void => {
    document.body.append(tourPickView({ races: RACES, current: ['sindarosa', 'rokcore', 'lavax'], onStart: vi.fn() }));
    // happy-dom mis-reports preselected options: set the team explicitly.
    ['sindarosa', 'rokcore', 'lavax'].forEach((v, i) => {
      sel(`arcadeHero${String(i + 1)}`).value = v;
    });
  };
  const team = (): string[] => ['arcadeHero1', 'arcadeHero2', 'arcadeHero3'].map((i) => sel(i).value);

  it('dropping a tile on a slot that holds another hero swaps, so there is never a duplicate', () => {
    mount();
    drag(tile('Lavax'), slotEl('0'));
    expect(team()).toEqual(['lavax', 'rokcore', 'sindarosa']);
    expect(new Set(team()).size).toBe(3);
  });

  it('shows a ghost and a drop highlight mid-drag and cleans both up after the drop', () => {
    mount();
    drag(tile('Lavax'), slotEl('1'), false);
    expect(document.querySelector('.heroGhost')).not.toBeNull();
    expect(slotEl('1').classList.contains('heroDropOn')).toBe(true);
    ptr('pointerup', slotEl('1'), 60, 60);
    expect(document.querySelector('.heroGhost')).toBeNull();
    expect(document.querySelector('.heroDropOn')).toBeNull();
    expect(team()).toEqual(['sindarosa', 'lavax', 'rokcore']);
  });

  it('a drop does not also preview or assign through the click that follows', () => {
    mount();
    drag(tile('Lavax'), slotEl('2'));
    click(slotEl('2'));
    expect(team()).toEqual(['sindarosa', 'rokcore', 'lavax']);
    expect(document.querySelector('.heroArmed')).toBeNull();
  });

  it('dragging a slot onto another slot swaps the two', () => {
    mount();
    drag(slotEl('0'), slotEl('2'));
    expect(team()).toEqual(['lavax', 'rokcore', 'sindarosa']);
  });

  it('dragging a slot back off to the grid or nowhere keeps the team as it was', () => {
    mount();
    drag(slotEl('1'), tile('Lavax'));
    drag(slotEl('1'), null);
    expect(team()).toEqual(['sindarosa', 'rokcore', 'lavax']);
    expect(document.querySelector('.heroGhost')).toBeNull();
  });

  it('a press that never moves is a plain click, not a drag', () => {
    mount();
    ptr('pointerdown', tile('Lavax'), 10, 10);
    ptr('pointerup', tile('Lavax'), 11, 10);
    expect(document.querySelector('.heroGhost')).toBeNull();
    expect(team()).toEqual(['sindarosa', 'rokcore', 'lavax']);
  });

  it('Escape cancels a drag', () => {
    mount();
    drag(tile('Lavax'), slotEl('0'), false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ptr('pointerup', slotEl('0'), 60, 60);
    expect(document.querySelector('.heroGhost')).toBeNull();
    expect(team()).toEqual(['sindarosa', 'rokcore', 'lavax']);
  });
});

describe('Versus picker', () => {
  const mount = (): void => {
    document.body.append(
      arcadePickView({
        races: RACES,
        levels: [{ value: '1', label: 'Level 1' }],
        current: { player: 'sindarosa', enemy: 'rokcore', level: '1', size: '3', mode: 'ai', partner: 'rokcore', partner2: 'lavax', enemyPartner: 'rokcore', enemyPartner2: 'lavax' },
        onStart: vi.fn(),
      }),
    );
  };
  const mine = (): string[] => ['arcadePlayer', 'arcadePartner', 'arcadePartner2'].map((i) => sel(i).value);

  it('a pointer click previews without picking; a second click picks', () => {
    mount();
    click(tile('Lavax'));
    expect(panelName()).toBe('Lavax');
    expect(document.querySelector('.vsFlags:not([hidden])')).toBeNull();
    click(tile('Lavax'));
    expect(sel('arcadePlayer').value).toBe('lavax');
    expect(document.querySelector('.vsFlags:not([hidden])')).not.toBeNull();
  });

  it('the Add to team button picks the previewed hero', () => {
    mount();
    click(tile('Rokcore'));
    click(document.querySelector('.heroAdd') as Element);
    expect(sel('arcadePlayer').value).toBe('rokcore');
  });

  it('dropping a tile on a slot fills that slot, and a hero already placed swaps instead of doubling', () => {
    mount();
    drag(tile('Lavax'), slotEl('partner'));
    expect(sel('arcadePartner').value).toBe('lavax');
    drag(tile('Rokcore'), slotEl('player'));
    expect(sel('arcadePlayer').value).toBe('rokcore');
    // Lavax is already in the partner slot: dropping it on the lead swaps the two.
    drag(tile('Lavax'), slotEl('player'));
    expect(sel('arcadePlayer').value).toBe('lavax');
    expect(sel('arcadePartner').value).toBe('rokcore');
  });

  it('dragging a picked slot onto another slot swaps; an unpicked slot cannot be picked up', () => {
    mount();
    drag(tile('Lavax'), slotEl('player'));
    drag(tile('Rokcore'), slotEl('partner'));
    drag(slotEl('player'), slotEl('partner'));
    expect(mine().slice(0, 2)).toEqual(['rokcore', 'lavax']);
    const before = mine();
    drag(slotEl('partner2'), slotEl('player'));
    expect(mine()).toEqual(before);
  });

  it('tap fallback: preview a hero then tap a slot', () => {
    mount();
    click(tile('Rokcore'));
    click(slotEl('partner'));
    expect(sel('arcadePartner').value).toBe('rokcore');
  });
});
