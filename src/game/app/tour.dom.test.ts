// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_UI_FLAGS } from '../platform/flags';
import { ARCADE_RACES } from './arcade-pick';
import { TOUR_KEY, loadRun } from './tour-store';
import { serializeRun, startRun, type TourRun } from './tour-model';
import { tourScreen, type TourDeps } from './tour';

const [A, B, C] = ARCADE_RACES;
if (!A || !B || !C) throw new Error('need three arcade races');

function fakeStorage(initial?: TourRun): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void; data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial) data.set(TOUR_KEY, serializeRun(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

let reduceMotion = false;
beforeEach(() => {
  reduceMotion = false;
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) => ({ matches: q.includes('reduce') && reduceMotion, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  for (const s of rigs.splice(0)) s.unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const rigs: Array<{ unmount: () => void }> = [];
interface Rig {
  host: HTMLElement;
  navigate: ReturnType<typeof vi.fn>;
  storage: ReturnType<typeof fakeStorage>;
  screen: ReturnType<typeof tourScreen>;
}

function mount(saved?: TourRun, over: Partial<TourDeps> = {}): Rig {
  const host = document.createElement('div');
  document.body.append(host);
  const navigate = vi.fn();
  const storage = fakeStorage(saved);
  const screen = tourScreen({
    flags: { ...DEFAULT_UI_FLAGS, forceNoWebgl: true },
    navigate,
    storage,
    randomSeed: () => 99,
    ...over,
  });
  screen.mount(host);
  rigs.push(screen);
  return { host, navigate, storage, screen };
}

const $ = (id: string): HTMLElement => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e;
};
const heading = (host: HTMLElement): string => host.querySelector('h1')?.textContent ?? '';
const saved = (r: Rig): TourRun | undefined => loadRun(r.storage);
const press = (k: string, target: EventTarget = document.body): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
};
const pickTeam = (a: string, b: string, c: string): void => {
  ($('arcadeHero1') as HTMLSelectElement).value = a;
  ($('arcadeHero2') as HTMLSelectElement).value = b;
  ($('arcadeHero3') as HTMLSelectElement).value = c;
  document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
};

describe('pick and start', () => {
  it('with no saved run shows the picker and focuses its heading', () => {
    const r = mount();
    expect(r.host.querySelector('#tourPick')).not.toBeNull();
    expect(document.activeElement).toBe(r.host.querySelector('h1'));
    expect(saved(r)).toBeUndefined();
  });

  it('starting saves a fresh run with the chosen team and the fixed seed flag, then shows stage 1', () => {
    const r = mount(undefined, { flags: { ...DEFAULT_UI_FLAGS, forceNoWebgl: true, seed: 42 } });
    pickTeam(B, C, A);
    expect(saved(r)).toEqual({ seed: 42, hero: [B, C, A], stage: 0, continues: 3, status: 'playing' });
    expect(r.host.querySelector('#tourStage')).not.toBeNull();
    expect(heading(r.host)).toBe('Stage 1 of 9');
    expect($('tourFight').textContent).toBe('Fight');
  });

  it('uses the random seed when no seed flag is set and replaces repeated heroes with distinct ones', () => {
    const r = mount();
    pickTeam(A, A, A);
    const run = saved(r);
    expect(run?.seed).toBe(99);
    expect(new Set(run?.hero).size).toBe(3);
    expect(run?.hero[0]).toBe(A);
  });
});

describe('resume', () => {
  const mid: TourRun = { ...startRun([A, B, C], 5), stage: 4, continues: 2 };

  it('offers Resume and New tour for a run in progress, describing it', () => {
    const r = mount(mid);
    expect(r.host.querySelector('#tourResume')).not.toBeNull();
    expect(r.host.textContent).toMatch(/stage 5 of 9, 2 continues left/);
  });

  it('Resume goes to the saved stage and keeps the run', () => {
    const r = mount(mid);
    $('tourResumeRun').click();
    expect(heading(r.host)).toBe('Stage 5 of 9');
    expect(saved(r)).toEqual(mid);
  });

  it('New tour clears the saved run and shows the picker', () => {
    const r = mount(mid);
    $('tourNew').click();
    expect(r.storage.data.has(TOUR_KEY)).toBe(false);
    expect(r.host.querySelector('#tourPick')).not.toBeNull();
  });

  it('finished runs are not offered for resume', () => {
    expect(mount({ ...mid, status: 'over' }).host.querySelector('#tourPick')).not.toBeNull();
    document.body.replaceChildren();
    expect(mount({ ...mid, status: 'won' }).host.querySelector('#tourPick')).not.toBeNull();
  });

  it('ignores a corrupt save', () => {
    const storage = fakeStorage();
    storage.data.set(TOUR_KEY, '{not json');
    const host = document.createElement('div');
    const s = tourScreen({ flags: DEFAULT_UI_FLAGS, navigate: () => undefined, storage, randomSeed: () => 1 });
    rigs.push(s);
    s.mount(host);
    expect(host.querySelector('#tourPick')).not.toBeNull();
  });
});

describe('defeat flow', () => {
  const lost = (continues: number): TourRun => ({ ...startRun([A, B, C], 5), stage: 2, continues, status: 'lost' });

  it('offers Continue (spending one) and Give up after a loss', () => {
    const r = mount(lost(2));
    $('tourResumeRun').click();
    expect(heading(r.host)).toBe('Defeat at Stage 3 of 9');
    expect(r.host.textContent).toContain('2 of 3 continues left.');
    const cont = $('tourContinue') as HTMLButtonElement;
    expect(cont.textContent).toBe('Continue (2 left)');
    cont.click();
    expect(saved(r)).toMatchObject({ status: 'playing', continues: 1, stage: 2 });
    expect(heading(r.host)).toBe('Stage 3 of 9');
  });

  it('disables Continue when none are left and says the tour is over', () => {
    const r = mount(lost(0));
    $('tourResumeRun').click();
    expect(($('tourContinue') as HTMLButtonElement).disabled).toBe(true);
    $('tourContinue').click();
    expect(saved(r)).toMatchObject({ status: 'lost', continues: 0 });
    expect(r.host.textContent).toContain('None left: the tour is over.');
  });

  it('Give up ends the run on a Game over card and Play again clears it back to the picker', () => {
    const r = mount(lost(1));
    $('tourResumeRun').click();
    $('tourGiveUp').click();
    expect(saved(r)?.status).toBe('over');
    expect(r.host.querySelector('#tourOver')).not.toBeNull();
    expect(heading(r.host)).toBe('Game over');
    $('tourAgain').click();
    expect(r.storage.data.has(TOUR_KEY)).toBe(false);
    expect(r.host.querySelector('#tourPick')).not.toBeNull();
  });
});

describe('versus splash and battle start', () => {
  const playing: TourRun = { ...startRun([A, B, C], 5), stage: 1 };

  function toStage(): Rig {
    const r = mount(playing);
    $('tourResumeRun').click();
    return r;
  }

  it('Fight shows a splash naming both leads, then the battle starts after 1.2 s', () => {
    vi.useFakeTimers();
    const r = toStage();
    $('tourFight').click();
    expect(r.host.querySelector('#tourSplash')).not.toBeNull();
    expect(r.host.textContent).toContain('You:');
    expect(r.host.textContent).toContain('Opponent:');
    vi.advanceTimersByTime(1199);
    expect(r.host.querySelector('#tourSplash')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(r.host.querySelector('#tourSplash')).toBeNull();
    expect(r.host.querySelector('#battle')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([['Enter'], [' ']])('%j skips the splash at once', (k) => {
    vi.useFakeTimers();
    const r = toStage();
    $('tourFight').click();
    expect(press(k).defaultPrevented).toBe(true);
    expect(r.host.querySelector('#battle')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a click on the splash skips it, and other keys do not', () => {
    vi.useFakeTimers();
    const r = toStage();
    $('tourFight').click();
    press('a');
    expect(r.host.querySelector('#tourSplash')).not.toBeNull();
    $('tourSplash').click();
    expect(r.host.querySelector('#battle')).not.toBeNull();
  });

  it('holdSplash pins the splash (no timer) until a key or click', () => {
    vi.useFakeTimers();
    const r = mount(playing, { flags: { ...DEFAULT_UI_FLAGS, forceNoWebgl: true, holdSplash: true } });
    $('tourResumeRun').click();
    $('tourFight').click();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(r.host.querySelector('#tourSplash')).not.toBeNull();
    press('Enter');
    expect(r.host.querySelector('#battle')).not.toBeNull();
  });

  it('reduced motion skips the splash entirely', () => {
    reduceMotion = true;
    const r = toStage();
    $('tourFight').click();
    expect(r.host.querySelector('#tourSplash')).toBeNull();
    expect(r.host.querySelector('#battle')).not.toBeNull();
  });

  it('without WebGL the battle area shows the WebGL error instead of loading', () => {
    reduceMotion = true;
    const r = toStage();
    $('tourFight').click();
    expect($('battle').querySelector('[role="alert"] h1')?.textContent).toBe('WebGL is required');
    expect(saved(r)).toEqual(playing);
  });

  it('leaving the screen during the splash never starts a battle', () => {
    vi.useFakeTimers();
    const r = toStage();
    $('tourFight').click();
    r.screen.unmount();
    vi.advanceTimersByTime(5000);
    press('Enter');
    expect(document.getElementById('battle')).toBeNull();
    expect(r.host.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Escape and unmount', () => {
  it('Escape on any card goes to the main menu, but not from inside a select or when already handled', () => {
    const r = mount();
    const select = $('arcadeHero1');
    press('Escape', select);
    expect(r.navigate).not.toHaveBeenCalled();
    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const claim = (e: Event): void => { e.preventDefault(); };
    document.body.addEventListener('keydown', claim);
    document.body.dispatchEvent(handled);
    document.body.removeEventListener('keydown', claim);
    expect(r.navigate).not.toHaveBeenCalled();
    expect(press('Escape').defaultPrevented).toBe(true);
    expect(r.navigate).toHaveBeenCalledExactlyOnceWith('main');
  });

  it('unmount removes the view and the Escape listener, and can be called twice', () => {
    const r = mount();
    r.screen.unmount();
    r.screen.unmount();
    expect(r.host.children).toHaveLength(0);
    press('Escape');
    expect(r.navigate).not.toHaveBeenCalled();
  });
});
