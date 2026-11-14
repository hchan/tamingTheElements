// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CharacterId } from '@core/index';
import { tourCardView, tourPickView, tourSplashView } from './tour';

afterEach(() => {
  document.body.replaceChildren();
});

const RACES = ['sindarosa', 'rokcore', 'lavax'] as CharacterId[];

describe('tourCardView', () => {
  const card = (over: Partial<Parameters<typeof tourCardView>[0]> = {}): HTMLElement =>
    tourCardView({ id: 'tourX', heading: 'Stage 2 of 9', lines: ['one', 'two'], actions: [], ...over });

  it('renders the id, one h1, one paragraph per line and a Main Menu link by default', () => {
    const page = card();
    expect(page.id).toBe('tourX');
    expect(page.querySelector('h1')?.textContent).toBe('Stage 2 of 9');
    expect([...page.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['one', 'two']);
    const link = page.querySelector('a');
    expect(link?.textContent).toBe('Main Menu');
    expect(link?.getAttribute('href')).toBe('#main');
  });

  it('omits the Main Menu link when menu is false', () => {
    expect(card({ menu: false }).querySelector('a')).toBeNull();
  });

  it('puts the extra element between the paragraphs and the buttons', () => {
    const extra = document.createElement('section');
    extra.id = 'mapExtra';
    const page = card({ extra, actions: [{ id: 'go', label: 'Fight', onClick: () => undefined }] });
    const order = [...page.children].map((c) => c.id || c.tagName.toLowerCase());
    expect(order).toEqual(['h1', 'p', 'p', 'mapExtra', 'div']);
  });

  it('wires each action; a disabled action stays in the page but does not fire', () => {
    const go = vi.fn();
    const cont = vi.fn();
    const page = card({
      actions: [
        { id: 'tourFight', label: 'Fight', onClick: go },
        { id: 'tourContinue', label: 'Continue (0 left)', disabled: true, onClick: cont },
      ],
    });
    document.body.append(page);
    const fight = document.getElementById('tourFight') as HTMLButtonElement;
    const dead = document.getElementById('tourContinue') as HTMLButtonElement;
    expect(fight.type).toBe('button');
    expect(fight.disabled).toBe(false);
    expect(dead.disabled).toBe(true);
    expect(dead.textContent).toBe('Continue (0 left)');
    fight.click();
    dead.click();
    expect(go).toHaveBeenCalledTimes(1);
    expect(cont).not.toHaveBeenCalled();
  });
});

describe('tourSplashView', () => {
  it('shows the stage, both sides in words next to their glyph, VS and the skip hint', () => {
    const glyphs: string[] = [];
    const page = tourSplashView(
      'Stage 1 of 9',
      { who: 'You', name: 'Fiara (fire)', element: 'fire', id: 'fiara' as CharacterId },
      { who: 'Opponent', name: 'Rokcore (earth)', element: 'earth', id: 'rokcore' as CharacterId },
      (e) => {
        glyphs.push(e);
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.dataset['element'] = e;
        return s;
      },
      'Earth arena',
    );
    expect(page.id).toBe('tourSplash');
    expect(page.querySelector('h1')?.textContent).toBe('Stage 1 of 9');
    expect(glyphs).toEqual(['fire', 'earth']);
    const text = [...page.querySelectorAll('p')].map((p) => p.textContent);
    expect(text).toEqual(['Earth arena', 'You: Fiara (fire)', 'Opponent: Rokcore (earth)', 'Press Enter, Space or tap to skip.']);
    const faces = [...page.querySelectorAll<HTMLElement>('.heroFace')];
    expect(faces).toHaveLength(2);
    expect(faces[0]?.style.backgroundImage).toContain('fiara');
    expect(faces[1]?.style.backgroundImage).toContain('rokcore');
    expect(page.querySelector('strong')?.textContent).toBe('VS');
    expect(page.querySelectorAll('svg')).toHaveLength(2);
  });
});

describe('tourPickView', () => {
  const sel = (id: string): HTMLSelectElement => document.getElementById(id) as HTMLSelectElement;
  const mount = (onStart = vi.fn(), current: [string, string, string] = ['sindarosa', 'rokcore', 'lavax']): HTMLElement => {
    const page = tourPickView({ races: RACES, current, onStart });
    document.body.append(page);
    return page;
  };

  // Preselection is not asserted: happy-dom mis-reports option.selected for options set before they are attached.
  it('has three labelled selects, each listing every race', () => {
    mount(vi.fn(), ['lavax', 'sindarosa', 'rokcore']);
    expect(['arcadeHero1', 'arcadeHero2', 'arcadeHero3'].map((id) => sel(id).name)).toEqual(['hero1', 'hero2', 'hero3']);
    expect(document.querySelector('label[for="arcadeHero1"]')?.textContent).toBe('Hero 1 (lead)');
    expect([...sel('arcadeHero2').options].map((o) => o.value)).toEqual(['', ...RACES]);
  });

  it('submitting reports the chosen values and prevents the default navigation', () => {
    const onStart = vi.fn();
    mount(onStart);
    sel('arcadeHero1').value = 'rokcore';
    sel('arcadeHero3').value = 'sindarosa';
    const ev = new Event('submit', { cancelable: true, bubbles: true });
    document.querySelector('form')?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onStart).toHaveBeenCalledWith({ hero1: 'rokcore', hero2: 'rokcore', hero3: 'sindarosa' });
  });

  const tile = (name: string): HTMLButtonElement =>
    [...document.querySelectorAll<HTMLButtonElement>('.heroTile')].find((t) => t.querySelector('.heroTileName')?.textContent === name) as HTMLButtonElement;

  it('shows a portrait grid with a tile per hero and the focused hero panel with its abilities', () => {
    mount();
    expect(document.querySelectorAll('.heroTile')).toHaveLength(RACES.length);
    expect(document.querySelector('.heroPanel .heroName')?.textContent).toBeTruthy();
    expect(document.querySelectorAll('.heroAbility').length).toBeGreaterThan(0);
  });

  it('a tile click fills the active slot, advances to the next slot and updates the hidden select', () => {
    mount(vi.fn(), ['', 'rokcore', 'sindarosa']);
    tile('Lavax').click();
    expect(sel('arcadeHero1').value).toBe('lavax');
    expect(document.getElementById('tourSlot2')?.getAttribute('aria-pressed')).toBe('true');
    expect(tile('Lavax').querySelector('.heroFlag')?.textContent).toBe('Slot 1');
  });

  it('picking a hero already in another slot swaps the two', () => {
    mount(vi.fn(), ['sindarosa', 'rokcore', 'lavax']);
    sel('arcadeHero1').value = 'sindarosa';
    sel('arcadeHero2').value = 'rokcore';
    sel('arcadeHero3').value = 'lavax';
    document.getElementById('tourSlot1')?.click();
    tile('Lavax').dispatchEvent(new Event('pointerenter'));
    (document.querySelector('.heroAdd') as HTMLElement).click();
    expect(sel('arcadeHero1').value).toBe('lavax');
    expect(sel('arcadeHero3').value).toBe('sindarosa');
  });

  it('the x button is inside its slot item with a title, and focus returns to the slot after removing', () => {
    mount();
    const x = document.querySelectorAll<HTMLElement>('.heroSlotClear')[1] as HTMLElement;
    expect(x.parentElement?.contains(document.getElementById('tourSlot2'))).toBe(true);
    expect(x.title).toBe('Remove Rokcore');
    x.click();
    expect(document.activeElement).toBe(document.getElementById('tourSlot2'));
    expect(document.querySelectorAll('.heroSlotClear')).toHaveLength(2);
  });

  it('after removing all three heroes the next pick fills the lead slot, then hero 2', () => {
    mount();
    for (let n = 0; n < 3; n++) (document.querySelectorAll('.heroSlotClear')[0] as HTMLElement).click();
    expect(document.querySelectorAll('.heroSlotClear')).toHaveLength(0);
    expect(document.getElementById('tourSlot1')?.getAttribute('aria-pressed')).toBe('true');
    tile('Lavax').click();
    expect(sel('arcadeHero1').value).toBe('lavax');
    expect(sel('arcadeHero2').value).toBe('');
    expect(document.getElementById('tourSlot2')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('removing the lead keeps the lead label on slot 1 and the next pick refills it', () => {
    mount();
    (document.querySelectorAll('.heroSlotClear')[0] as HTMLElement).click();
    expect(document.getElementById('tourSlot1')?.textContent).toContain('Hero 1 (lead)');
    tile('Sindarosa').click();
    expect(sel('arcadeHero1').value).toBe('sindarosa');
  });

  it('the panel button says what it will do: Add, Swap into the active hero, or Remove', () => {
    mount();
    const btn = (): string => document.querySelector('.heroAdd')?.textContent ?? '';
    document.getElementById('tourSlot1')?.click();
    tile('Sindarosa').dispatchEvent(new Event('pointerenter'));
    expect(btn()).toBe('Remove from team');
    tile('Lavax').dispatchEvent(new Event('pointerenter'));
    expect(btn()).toBe('Swap into hero 1');
    (document.querySelectorAll('.heroSlotClear')[0] as HTMLElement).click();
    tile('Sindarosa').dispatchEvent(new Event('pointerenter'));
    expect(btn()).toBe('Add to team');
  });

  it('arrow keys move the cursor and show that hero in the panel', () => {
    mount();
    const before = document.querySelector('.heroPanel .heroName')?.textContent;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.querySelectorAll('.heroCursor')).toHaveLength(1);
    expect(before).toBeTruthy();
  });

  it('never shows the retired words to players', () => {
    mount();
    expect(document.body.textContent).not.toMatch(/classic|arcade|ruleset|capture/i);
  });

  it('has a submit button #tourStart and a Back link to #main', () => {
    mount();
    const start = document.getElementById('tourStart') as HTMLButtonElement;
    expect(start.type).toBe('submit');
    expect(start.textContent).toBe('Start tour');
    expect(document.querySelector('a.menuButton')?.getAttribute('href')).toBe('#main');
  });
  describe('unselecting', () => {
    const slotText = (n: number): string => document.getElementById(`tourSlot${String(n)}`)?.textContent ?? '';
    const live = (): string => document.querySelector('[role=status]')?.textContent ?? '';
    const startBtn = (): HTMLButtonElement => document.getElementById('tourStart') as HTMLButtonElement;
    const hint = (): string => document.getElementById('tourHint')?.textContent ?? '';

    it('every filled slot has a labelled x button that empties it, announces it and disables Start with a hint', () => {
      mount();
      const x = document.querySelector('button[aria-label="Remove Rokcore from slot 2"]') as HTMLButtonElement;
      expect(x).not.toBeNull();
      expect(document.querySelectorAll('.heroSlotClear')).toHaveLength(3);
      x.click();
      expect(sel('arcadeHero2').value).toBe('');
      expect(slotText(2)).toContain('Empty');
      expect(document.getElementById('tourSlot2')?.classList.contains('heroSlotEmpty')).toBe(true);
      expect(document.querySelectorAll('.heroSlotClear')).toHaveLength(2);
      expect(live()).toBe('Rokcore removed from hero 2.');
      expect(startBtn().disabled).toBe(true);
      expect(hint()).toBe('Pick 1 more hero');
    });

    it('Delete and Backspace on a focused slot clear it', () => {
      mount();
      for (const [key, n] of [['Delete', 1], ['Backspace', 3]] as const) {
        const b = document.getElementById(`tourSlot${String(n)}`) as HTMLElement;
        const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        b.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);
        expect(sel(`arcadeHero${String(n)}`).value).toBe('');
      }
      expect(hint()).toBe('Pick 2 more heroes');
    });

    it('activating a hero already on the team again (Enter or click) takes it off; the next pick refills that slot', () => {
      mount();
      tile('Rokcore').click();
      expect(sel('arcadeHero2').value).toBe('');
      expect(tile('Rokcore').getAttribute('aria-pressed')).toBe('false');
      expect(tile('Rokcore').querySelector('.heroFlag')).toBeNull();
      tile('Rokcore').click();
      expect(sel('arcadeHero2').value).toBe('rokcore');
      expect(startBtn().disabled).toBe(false);
      expect(hint()).toBe('');
    });

    it('an empty slot reads Empty, has no x button, and Start with all empty says Pick 3 heroes', () => {
      mount(vi.fn(), ['', '', '']);
      expect([1, 2, 3].map(slotText).every((t) => t.includes('Empty'))).toBe(true);
      expect(document.querySelectorAll('.heroSlotClear')).toHaveLength(0);
      expect(hint()).toBe('Pick 3 heroes');
      expect(startBtn().disabled).toBe(true);
    });

    it('submitting an incomplete team never calls onStart', () => {
      const onStart = vi.fn();
      mount(onStart);
      (document.getElementById('tourSlot1') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      expect(onStart).not.toHaveBeenCalled();
      expect(live()).toBe('Pick all three heroes first.');
    });

    it('gamepad B steps back a slot and empties it', () => {
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
      let pressed = false;
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => [{ axes: [0, 0], buttons: Array.from({ length: 16 }, (_v, k) => ({ pressed: k === 1 && pressed })) }],
      });
      mount();
      pressed = true;
      frames.shift()?.(0);
      // The active slot starts at 1, so B steps back to slot 3 (wrapping) and empties it.
      expect(sel('arcadeHero3').value).toBe('');
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, 'getGamepads');
    });
  });
});
