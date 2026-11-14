import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// The stage hazard telegraph (stage-selection-hazards), in game on every element stage: the hero of that element calls its
// weather to swap the stage, then the sim steps until the hazard warns. A shot of the warning and of the strike goes to the
// test output dir (HAZARD_OUT keeps them elsewhere) for the grim-look review. The reduced-motion block checks the pulse holds.
const WEATHER = 1 << 14;
const INTRO = 91;
const CASES: ReadonlyArray<readonly [string, string, number]> = [['fire', 'sindarosa', 1], ['water', 'curomo', 2], ['earth', 'rokcore', 3], ['air', 'echo', 4]];

interface Marker { kind: number; phase: 'warn' | 'active'; w: number; h: number; dir: number; alpha: number; chevrons: number }

const frames = (page: Page): Promise<unknown> => page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
const hazard = async (page: Page): Promise<Marker | undefined> => {
  await frames(page);
  return (await page.evaluate<readonly Marker[] | undefined>('window.__TTE__.arena.hazard()'))?.[0];
};

/** Starts `hero` against an idle Pax, swaps to the hero's element stage, then steps until that stage's hazard warns. */
async function toWarning(page: Page, hero: string, stage: number): Promise<Marker> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption(hero);
  await page.getByLabel('AI race').selectOption('pax');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)}, [0, 0])`);
  await page.evaluate('window.__TTE__.arena.setWeatherCharge(0, 1000)');
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(WEATHER)}, 0])`);
  await page.evaluate('window.__TTE__.arena.step(60, [0, 0])');
  await frames(page);
  expect(await page.evaluate<{ stage: number } | undefined>('window.__TTE__.arena.terrain()')).toMatchObject({ stage });
  for (let i = 0; i < 160; i++) {
    const m = await hazard(page);
    if (m?.kind === stage && m.phase === 'warn') return m;
    await page.evaluate('window.__TTE__.arena.step(10, [0, 0])');
  }
  throw new Error(`no ${String(stage)} hazard warning`);
}

/** The warning's outline alpha over 12 single ticks. */
async function warnAlphas(page: Page): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < 12; i++) {
    const m = await hazard(page);
    if (m?.phase !== 'warn') break;
    out.push(m.alpha);
    await page.evaluate('window.__TTE__.arena.step(1, [0, 0])');
  }
  return out;
}

for (const [element, hero, stage] of CASES) {
  test(`the ${element} stage telegraphs its hazard, then strikes`, async ({ page }, info) => {
    const errors = collectErrors(page);
    const out = process.env.HAZARD_OUT;
    const snap = async (name: string): Promise<void> => {
      await frames(page);
      const path = out ? `${out}/hazard-${element}-${name}.png` : info.outputPath(`hazard-${element}-${name}.png`);
      expect((await page.locator('#game canvas').screenshot({ path })).length).toBeGreaterThan(2000);
    };
    const warn = await toWarning(page, hero, stage);
    expect(warn.w).toBeGreaterThan(0);
    expect(warn.h).toBeGreaterThan(0);
    if (stage === 2 || stage === 4) {
      expect([-1, 1]).toContain(warn.dir);
      expect(warn.chevrons).toBeGreaterThan(0);
    }
    // Half way into the warning, so the outline has firmed up for the shot.
    await page.evaluate('window.__TTE__.arena.step(25, [0, 0])');
    await snap('warn');
    let active: Marker | undefined;
    for (let i = 0; i < 6 && active?.phase !== 'active'; i++) {
      await page.evaluate('window.__TTE__.arena.step(5, [0, 0])');
      active = await hazard(page);
    }
    expect(active).toMatchObject({ kind: stage, phase: 'active' });
    await snap('strike');
    expect(errors).toEqual([]);
  });
}

test('the hazard warning pulses', async ({ page }) => {
  await toWarning(page, 'sindarosa', 1);
  const a = await warnAlphas(page);
  expect(a.length).toBeGreaterThanOrEqual(12);
  expect(a.some((v, i) => i > 0 && v < (a[i - 1] ?? 0))).toBe(true);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the hazard warning firms up steadily, with no blink', async ({ page }) => {
    await toWarning(page, 'sindarosa', 1);
    const a = await warnAlphas(page);
    expect(a.length).toBeGreaterThanOrEqual(12);
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThanOrEqual(a[i - 1] ?? 0);
  });
});
