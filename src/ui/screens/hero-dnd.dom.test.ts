// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCharacter, type CharacterId } from '@core/index';
import { arcadePickView } from './arcade-versus';
import { tourPickView } from './tour';

afterEach(() => {
  document.body.replaceChildren();
});

const RACES = ['sindarosa', 'rokcore', 'lavax'] as CharacterId[];
const sel = (id: string): HTMLSelectElement => document.getElementById(id) as HTMLSelectElement;
const tile = (name: string): HTMLElement =>
  [...document.querySelectorAll<HTMLElement>('.heroTile')].find(
    (t) => t.querySelector('.heroTileName')?.textContent === name,
  ) as HTMLElement;
const slotEl = (key: string): HTMLElement =>
  document.querySelector(`[data-hero-slot="${key}"]`) as HTMLElement;
const panelName = (): string | null | undefined =>
  document.querySelector('.heroPanel .heroName')?.textContent;

/** A pointer click: like a real mouse or touch click, `detail` is 1 (a keyboard activation has detail 0). */
const click = (n: Element): void => {
  n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
};
const ptr = (type: string, target: Element, x: number, y: number): void => {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: x,
      clientY: y,
    }),
  );
};
/** Press on `from`, drag over `to` (or nowhere), release; optionally stop mid-drag. */
const drag = (from: Element, to: Element | null, release = true): void => {
  ptr('pointerdown', from, 10, 10);
  ptr('pointermove', to ?? document.body, 60, 60);
  if (release) ptr('pointerup', to ?? document.body, 60, 60);
};

describe('Play picker: click previews, second click or Add assigns', () => {
  const mount = (team: readonly string[] = ['sindarosa', 'rokcore', 'lavax']): void => {
    document.body.append(
      tourPickView({ races: RACES, current: ['sindarosa', 'rokcore', 'lavax'], onStart: vi.fn() }),
    );
    // happy-dom mis-reports preselected options: set the team explicitly.
    team.forEach((v, i) => {
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
    mount(['sindarosa', 'rokcore', '']);
    click(tile('Lavax'));
    click(tile('Lavax'));
    expect(sel('arcadeHero1').value).toBe('lavax');
    expect(tile('Lavax').classList.contains('heroArmed')).toBe(false);
  });

  it('a second click on a hero already on the team takes it off', () => {
    mount();
    click(tile('Lavax'));
    click(tile('Lavax'));
    expect(sel('arcadeHero3').value).toBe('');
    expect(sel('arcadeHero1').value).toBe('sindarosa');
  });

  it('the Add to team button assigns the previewed hero, even after the pointer wandered over other tiles', () => {
    mount();
    click(tile('Rokcore'));
    tile('Lavax').dispatchEvent(new Event('pointerenter'));
    expect(panelName()).toBe('Rokcore');
    click(document.querySelector('.heroAdd') as Element);
    expect(sel('arcadeHero1').value).toBe('rokcore');
    expect(
      new Set(['arcadeHero1', 'arcadeHero2', 'arcadeHero3'].map((i) => sel(i).value)).size,
    ).toBe(3);
  });

  it('keyboard activation (detail 0) still assigns straight away, and toggles a team hero off', () => {
    mount(['sindarosa', 'rokcore', '']);
    tile('Lavax').click();
    expect(sel('arcadeHero1').value).toBe('lavax');
    tile('Lavax').click();
    expect(sel('arcadeHero1').value).toBe('');
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
  const mount = (initial: readonly string[] = ['sindarosa', 'rokcore', 'lavax']): void => {
    document.body.append(
      tourPickView({ races: RACES, current: ['sindarosa', 'rokcore', 'lavax'], onStart: vi.fn() }),
    );
    // happy-dom mis-reports preselected options: set the team explicitly.
    initial.forEach((v, i) => {
      sel(`arcadeHero${String(i + 1)}`).value = v;
    });
  };
  const team = (): string[] =>
    ['arcadeHero1', 'arcadeHero2', 'arcadeHero3'].map((i) => sel(i).value);

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

  it('dragging a slot off onto the grid or nowhere removes it from the team', () => {
    mount();
    drag(slotEl('1'), tile('Lavax'));
    expect(team()).toEqual(['sindarosa', '', 'lavax']);
    drag(slotEl('0'), null);
    expect(team()).toEqual(['', '', 'lavax']);
    expect(document.querySelector('.heroGhost')).toBeNull();
    expect(document.querySelector('#tourStart')?.hasAttribute('disabled')).toBe(true);
  });

  it('dragging an empty slot does nothing, and Escape keeps a dragged slot', () => {
    mount(['sindarosa', '', 'lavax']);
    drag(slotEl('1'), null);
    expect(team()).toEqual(['sindarosa', '', 'lavax']);
    drag(slotEl('0'), null, false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ptr('pointerup', document.body, 60, 60);
    expect(team()).toEqual(['sindarosa', '', 'lavax']);
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

describe('edge scroll scrolls the picker region (PB1)', () => {
  it('a drag held near the bottom of .pickScroll scrolls it, not the window', () => {
    document.body.append(
      tourPickView({ races: RACES, current: ['sindarosa', 'rokcore', 'lavax'], onStart: vi.fn() }),
    );
    const box = document.querySelector('.pickScroll') as HTMLElement;
    box.getBoundingClientRect = () => ({
      top: 100,
      bottom: 400,
      left: 0,
      right: 300,
      width: 300,
      height: 300,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    const winScroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    box.scrollTop = 0;
    ptr('pointerdown', tile('Lavax'), 10, 10);
    ptr('pointermove', document.body, 60, 395);
    frames.shift()?.(0);
    expect(box.scrollTop).toBeGreaterThan(0);
    expect(winScroll).not.toHaveBeenCalled();
    ptr('pointerup', document.body, 60, 395);
    vi.unstubAllGlobals();
    winScroll.mockRestore();
  });
});

describe('hero pickers voice their clicks as the hero element (ui-sfx reads data-element)', () => {
  it('race selects carry the picked hero element and follow changes', () => {
    document.body.append(
      arcadePickView({
        races: RACES,
        levels: [{ value: '1', label: 'Level 1' }],
        current: {
          player: 'rokcore',
          enemy: 'lavax',
          level: '1',
          size: '1',
          mode: 'ai',
          partner: '',
          partner2: '',
          enemyPartner: '',
          enemyPartner2: '',
        },
        onStart: vi.fn(),
      }),
    );
    const voice = (id: string): string | undefined =>
      sel(id).closest<HTMLElement>('[data-element]')?.dataset['element'];
    expect(voice('arcadePlayer')).toBe(getCharacter('rokcore' as CharacterId).element);
    expect(voice('arcadeEnemy')).toBe(getCharacter('lavax' as CharacterId).element);
    expect(voice('arcadePartner')).toBeUndefined();
    sel('arcadePlayer').value = 'sindarosa';
    sel('arcadePlayer').dispatchEvent(new Event('change', { bubbles: true }));
    expect(voice('arcadePlayer')).toBe(getCharacter('sindarosa' as CharacterId).element);
  });
});
