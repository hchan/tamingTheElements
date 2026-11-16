// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { raceLabel } from '@ui/screens/arcade-versus';
import { DEFAULT_UI_FLAGS } from '../platform/flags';
import { FIRST_RUN_KEY } from './first-run-hint';
import { TOUR_KEY } from './tour-store';
import { TOUR_STAGES, serializeRun, startRun, type TourRun } from './tour-model';
import { locationName, tourFight } from './tour-match';
import { tourScreen } from './tour';

/** QA r67: for one run, the Tour card, the versus splash and the fight descriptor name the same opponents and place. */
const TEAM = ['sindarosa', 'pax', 'curomo'] as unknown as TourRun['hero'];
const strip = (s: string): string => s.replace(/ \([^)]*\)/g, '');
const text = (root: ParentNode, sel: string): string => root.querySelector(sel)?.textContent ?? '';
const all = (root: ParentNode, sel: string): string[] => [...root.querySelectorAll(sel)].map((e) => e.textContent);

beforeEach(() => {
  localStorage.removeItem(FIRST_RUN_KEY);
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  localStorage.removeItem(FIRST_RUN_KEY);
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function open(run: TourRun): { host: HTMLElement; unmount: () => void } {
  const host = document.createElement('div');
  document.body.append(host);
  const data = new Map([[TOUR_KEY, serializeRun(run)]]);
  const screen = tourScreen({
    flags: { ...DEFAULT_UI_FLAGS, forceNoWebgl: true, holdSplash: true },
    navigate: vi.fn(),
    storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) },
    randomSeed: () => 99,
  });
  screen.mount(host);
  return { host, unmount: () => { screen.unmount(); host.remove(); } };
}

const click = (id: string): void => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  e.click();
};

/** Opens the card of `run`, then the splash, and checks both against `tourFight(run)`. */
function checkScreens(run: TourRun): void {
  const fight = tourFight(run);
  const foes = [fight.pick.enemy, ...(fight.pick.enemyBench ?? [])].map(raceLabel).map(strip);
  expect(foes).toEqual(fight.stage.opponents.map(raceLabel).map(strip));
  const { host, unmount } = open(run);
  try {
    click('tourResumeRun');
    if (run.status === 'lost') click('tourContinue');
    const facts = (k: string): string => text(host, `[data-fact="${k}"] .tourFactValue`);
    expect(facts('location')).toBe(locationName(fight.stage));
    expect(facts('opponent').split(', ')).toEqual(foes);
    click('tourFight');
    const names = all(host, '.vsName');
    expect(names).toHaveLength(2);
    const lead = strip((names[1] ?? '').replace(/^Opponent: /, ''));
    const benches = [...host.querySelectorAll('ul.vsBench')];
    const foeBench = benches.length === 2 ? all(benches[1] as Element, '.vsBenchName').map(strip) : [];
    expect([lead, ...foeBench]).toEqual(foes);
    const place = text(host, '.vsStageName');
    expect(place).toBe(fight.stage.location === 'void' ? 'The Eternal Void' : `${locationName(fight.stage)} arena`);
  } finally {
    unmount();
  }
}

describe('Tour card == splash == fight', () => {
  it('for seed 42, every stage, with 3 and 1 continues left', () => {
    for (let stage = 0; stage < TOUR_STAGES; stage++) {
      for (const continues of [3, 1]) checkScreens({ ...startRun(TEAM, 42), stage, continues });
    }
  });

  it('after a defeat and a Continue', () => {
    checkScreens({ ...startRun(TEAM, 42), stage: 3, continues: 2, status: 'lost' });
  });

  it('names the last stage The Eternal Void on the card as well as the splash', () => {
    const { host, unmount } = open({ ...startRun(TEAM, 42), stage: TOUR_STAGES - 1 });
    click('tourResumeRun');
    expect(text(host, '[data-fact="location"] .tourFactValue')).toBe('The Eternal Void');
    unmount();
  });
});
