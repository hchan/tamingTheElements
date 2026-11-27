// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CharacterId } from '@core/index';
import { tourCardView, tourPickView, tourSplashView, tourStageChip } from './tour';

afterEach(() => {
  document.body.replaceChildren();
});

const RACES = ['sindarosa', 'rokcore', 'lavax'] as CharacterId[];

describe('tourCardView', () => {
  const card = (over: Partial<Parameters<typeof tourCardView>[0]> = {}): HTMLElement =>
    tourCardView({
      id: 'tourX',
      heading: 'Stage 2 of 9',
      lines: ['one', 'two'],
      actions: [],
      ...over,
    });

  it('renders the id, one h1, one paragraph per line and a Main Menu link by default', () => {
    const page = card();
    expect(page.id).toBe('tourX');
    expect(page.querySelector('h1')?.textContent).toBe('Stage 2 of 9');
    expect([...page.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['one', 'two']);
    const link = page.querySelector('a');
    expect(link?.textContent).toBe('Main Menu');
    expect(link?.getAttribute('href')).toBe('#main');
  });

  it('renders a rows fact as key chips and a value fact as text', () => {
    const page = card({
      facts: [
        { key: 'location', label: 'Location', value: 'Fire' },
        { key: 'controls', label: 'Controls', rows: [[{ keys: ['W', 'A'], action: 'Move', note: '(or arrows)' }, { keys: ['1'], action: 'Strike' }], [{ keys: ['7'], action: 'Dash' }]] },
      ],
    });
    expect(page.querySelector('[data-fact="location"] .tourFactValue')?.textContent).toBe('Fire');
    const c = page.querySelector('[data-fact="controls"]');
    expect(c?.classList.contains('tourKeys')).toBe(true);
    expect(c?.querySelectorAll('.tourKeyRow')).toHaveLength(2);
    expect([...(c?.querySelectorAll('.tourKey kbd') ?? [])].map((k) => k.textContent)).toEqual(['W', 'A', '1', '7']);
    expect(c?.textContent).toMatch(/^Controls:/);
    expect(c?.textContent).toContain('Move');
    expect(c?.textContent).toContain('Dash');
    expect(c?.querySelector('.tourKeyNote')?.textContent).toBe('(or arrows)');
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
    expect(text).toEqual([
      'Earth arena',
      'You: Fiara (fire)',
      'Opponent: Rokcore (earth)',
      'Press Enter, Space or tap to skip.',
    ]);
    const faces = [...page.querySelectorAll<HTMLElement>('.heroFace')];
    expect(faces).toHaveLength(2);
    expect(faces[0]?.style.backgroundImage).toContain('fiara');
    expect(faces[1]?.style.backgroundImage).toContain('rokcore');
    expect(page.querySelector('strong')?.textContent).toBe('VS');
    expect(page.querySelectorAll('svg')).toHaveLength(2);
  });
});

describe('tourSplashView bench and tourStageChip', () => {
  const glyph = (e: string): SVGElement => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.dataset['element'] = e;
    return s;
  };
  it('the splash names every hero on both teams', () => {
    const m = (id: string, name: string, element: string): { id: CharacterId; name: string; element: string } => ({ id: id as CharacterId, name, element });
    const page = tourSplashView(
      'Stage 1 of 9',
      { who: 'You', ...m('fiara', 'Fiara (fire)', 'fire'), bench: [m('rokcore', 'Rokcore (earth)', 'earth'), m('curomo', 'Curomo (water)', 'water')] },
      { who: 'Opponent', ...m('cyclonius', 'Cyclonius (air)', 'air'), bench: [m('pax', 'Pax (earth)', 'earth'), m('lavax', 'Lavax (fire)', 'fire')] },
      glyph,
    );
    expect(page.querySelectorAll('.vsName')).toHaveLength(2);
    expect(page.querySelectorAll('.vsBenchName')).toHaveLength(4);
    expect(page.querySelectorAll('svg')).toHaveLength(2);
    expect(page.querySelectorAll('.heroFace')).toHaveLength(6);
    const faces = [...page.querySelectorAll<HTMLElement>('.vsBenchFace')];
    expect(faces.map((f) => /rokcore|curomo|pax|lavax/.exec(f.style.backgroundImage)?.[0])).toEqual(['rokcore', 'curomo', 'pax', 'lavax']);
    // QA r66: every portrait scales smoothly (the strips are not an integer multiple of the face size).
    expect([...page.querySelectorAll<HTMLElement>('.heroFace')].map((f) => f.style.imageRendering)).toEqual(Array<string>(6).fill('auto'));
    expect([...page.querySelectorAll('ul.vsBench')].map((u) => u.getAttribute('aria-label'))).toEqual(['Your teammates', "Opponent's teammates"]);
    expect(page.textContent).not.toMatch(/classic|arcade|ruleset|capture/i);
  });

  it('the stage chip states stage and continues in words, pinned bottom-left and click-through', () => {
    const chip = (n: number): HTMLElement => tourStageChip(3, 9, n);
    expect(chip(3).textContent).toBe('Stage 3 of 9 3 continues left');
    expect(chip(1).textContent).toContain('1 continue left');
    expect(chip(0).textContent).toContain('No continues left');
    const c = chip(2);
    expect(c.id).toBe('tourHudStage');
    expect(c.style.position).toBe('absolute');
    expect(c.style.pointerEvents).toBe('none');
  });
});


describe('tourPickView', () => {
  const sel = (id: string): HTMLSelectElement => document.getElementById(id) as HTMLSelectElement;
  const mount = (
    onStart = vi.fn(),
    current: [string, string, string] = ['sindarosa', 'rokcore', 'lavax'],
  ): HTMLElement => {
    const page = tourPickView({ races: RACES, current, onStart });
    document.body.append(page);
    return page;
  };
  const key = (code: string): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    return e;
  };
  const tile = (name: string): HTMLButtonElement =>
    [...document.querySelectorAll<HTMLButtonElement>('.heroTile')].find(
      (t) => t.querySelector('.heroTileName')?.textContent === name,
    ) as HTMLButtonElement;
  const slot = (n: number): HTMLElement => document.getElementById(`tourSlot${String(n)}`) as HTMLElement;
  const slotText = (n: number): string => slot(n).textContent;
  const live = (): string => document.querySelector('[role=status]')?.textContent ?? '';
  const startBtn = (): HTMLButtonElement => document.getElementById('tourStart') as HTMLButtonElement;
  const hint = (): string => document.getElementById('tourHint')?.textContent ?? '';

  it('has a first-Tab Jump to Fight chip that focuses Start tour, or Random while Start waits', () => {
    const page = mount();
    const jump = page.querySelector<HTMLButtonElement>('.vsJumpFight');
    expect(jump?.textContent).toBe('Jump to Fight');
    expect(page.querySelector('form')?.querySelector('button, select, input, a')).toBe(jump);
    startBtn().disabled = false;
    jump?.click();
    expect(document.activeElement).toBe(startBtn());
    startBtn().disabled = true;
    jump?.click();
    expect(document.activeElement?.id).toBe('tourRandom');
  });

  // Preselection is not asserted: happy-dom mis-reports option.selected for options set before they are attached.
  it('keeps three labelled hidden selects, each listing every race', () => {
    mount(vi.fn(), ['lavax', 'sindarosa', 'rokcore']);
    expect(['arcadeHero1', 'arcadeHero2', 'arcadeHero3'].map((id) => sel(id).name)).toEqual(['hero1', 'hero2', 'hero3']);
    expect(document.querySelector('label[for="arcadeHero1"]')?.textContent).toBe('Hero 1 (lead)');
    expect([...sel('arcadeHero2').options].map((o) => o.value)).toEqual(['', ...RACES]);
    expect(sel('arcadeHero1').tabIndex).toBe(-1);
  });

  it('shows one numbered team stack (Starter, Tag, Tag) and a hero grid with the focused hero panel', () => {
    mount();
    expect(document.querySelectorAll('#tourPick .tsRow')).toHaveLength(3);
    expect(document.querySelectorAll('#tourPick .tsRow:not([disabled])')).toHaveLength(3);
    expect(slotText(1)).toContain('Starter');
    expect(slotText(2)).toContain('Tag');
    expect(document.querySelectorAll('.heroTile')).toHaveLength(RACES.length);
    expect(document.querySelector('.heroPanel .heroName')?.textContent).toBeTruthy();
    expect(document.querySelectorAll('.heroAbility').length).toBeGreaterThan(0);
  });

  it('has no Add, Swap or x buttons', () => {
    mount();
    expect(document.querySelector('.heroAdd')).toBeNull();
    expect(document.querySelector('.heroSlotClear')).toBeNull();
  });

  it('changing a hero select moves the detail pane to that hero (A8)', () => {
    mount();
    const s = sel('arcadeHero2');
    s.value = 'lavax';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelector('.heroPanel .heroName')?.textContent).toBe('Lavax');
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

  it('a tile click locks the hero into the next empty slot, then the next, with no second gesture', () => {
    mount(vi.fn(), ['', '', '']);
    tile('Lavax').click();
    expect(sel('arcadeHero1').value).toBe('lavax');
    expect(slot(1).title).toContain('Remove Lavax from slot 1');
    expect(slot(2).getAttribute('aria-current')).toBe('step');
    expect(live()).toBe('You picked Lavax for slot 1.');
    tile('Rokcore').click();
    expect(sel('arcadeHero2').value).toBe('rokcore');
    expect(hint()).toBe('Pick 1 more hero');
    tile('Sindarosa').click();
    expect(sel('arcadeHero3').value).toBe('sindarosa');
    expect(startBtn().disabled).toBe(false);
    expect(hint()).toBe('');
  });

  it('keys: D moves, Space locks, Q pops the last pick, then Start waits', () => {
    mount(vi.fn(), ['', '', '']);
    key('Space');
    key('KeyD');
    key('Space');
    key('KeyD');
    key('Space');
    expect([1, 2, 3].map((n) => sel(`arcadeHero${String(n)}`).value).every((v) => v !== '')).toBe(true);
    expect(startBtn().disabled).toBe(false);
    key('KeyQ');
    expect(sel('arcadeHero3').value).toBe('');
    expect(slotText(3)).toContain('Empty');
    expect(startBtn().disabled).toBe(true);
    expect(hint()).toBe('Pick 1 more hero');
    expect(live()).toBe('Slot 3 is empty again.');
  });

  it('Space on a full team starts the tour', () => {
    const onStart = vi.fn();
    mount(onStart, ['', '', '']);
    key('Space');
    key('KeyD');
    key('Space');
    key('KeyD');
    key('Space');
    expect(onStart).not.toHaveBeenCalled();
    key('Space');
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('clicking a filled row removes that hero; Delete and Backspace on a row do too', () => {
    mount(vi.fn(), ['', '', '']);
    for (const n of ['Lavax', 'Rokcore', 'Sindarosa']) tile(n).click();
    slot(2).click();
    // The stack closes the gap: Sindarosa moves up to slot 2.
    expect([1, 2, 3].map((n) => sel(`arcadeHero${String(n)}`).value)).toEqual(['lavax', 'sindarosa', '']);
    expect(live()).toBe('Rokcore removed from slot 2.');
    for (const [k, left] of [['Delete', ['sindarosa', '', '']], ['Backspace', ['', '', '']]] as const) {
      const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      slot(1).dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      expect([1, 2, 3].map((n) => sel(`arcadeHero${String(n)}`).value)).toEqual(left);
    }
    expect(hint()).toBe('Pick 3 heroes');
  });

  it('the Random button fills one empty slot', () => {
    mount(vi.fn(), ['', '', '']);
    (document.getElementById('tourRandom') as HTMLElement).click();
    expect([1, 2, 3].filter((n) => sel(`arcadeHero${String(n)}`).value !== '')).toHaveLength(1);
    expect(hint()).toBe('Pick 2 more heroes');
  });

  it('empty slots read Empty, and Start with all empty says Pick 3 heroes', () => {
    mount(vi.fn(), ['', '', '']);
    expect([1, 2, 3].map(slotText).every((t) => t.includes('Empty'))).toBe(true);
    expect(hint()).toBe('Pick 3 heroes');
    expect(startBtn().disabled).toBe(true);
  });

  it('submitting an incomplete team never calls onStart', () => {
    const onStart = vi.fn();
    mount(onStart, ['', 'rokcore', 'lavax']);
    document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(onStart).not.toHaveBeenCalled();
    expect(live()).toBe('Pick all three heroes first.');
  });

  it('gamepad B pops the last pick', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    let pressed = false;
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [{ axes: [0, 0], buttons: Array.from({ length: 16 }, (_v, k) => ({ pressed: k === 1 && pressed })) }],
    });
    mount(vi.fn(), ['', '', '']);
    for (const n of ['Lavax', 'Rokcore']) tile(n).click();
    pressed = true;
    frames.shift()?.(0);
    expect(sel('arcadeHero2').value).toBe('');
    expect(sel('arcadeHero1').value).toBe('lavax');
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'getGamepads');
  });

  it('never shows the retired words to players and has a Start tour submit and a Back link', () => {
    mount();
    expect(document.body.textContent).not.toMatch(/classic|arcade|ruleset|capture/i);
    expect(startBtn().type).toBe('submit');
    expect(startBtn().textContent).toBe('Start tour');
    expect(document.querySelector('a.menuButton')?.getAttribute('href')).toBe('#main');
  });
});
