import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Own-element patch effects (ideas/in-progress/own-element-tile-effects.md, WP 1): a hero standing on a stage patch of its own
// element shows that element's looping animation (water motes plus a plus pulse on each heal, fire flames, air wind swirls,
// earth plates and dust); it starts on entering, stops on leaving, covers both teams, and reduced motion draws a static glow.
// The stage is forced with the race's weather call. SHOT_DIR=<dir> saves a screenshot per element (headless).

interface Probe {
  readonly active: readonly { id: number; team: number; kind: number; age: number; pulse: boolean }[];
  readonly parts: number;
  readonly reduced: boolean;
}
const WEATHER = 1 << 14;
const INTRO = 91;
const SHOT_DIR = process.env['SHOT_DIR'];
const RACES: readonly [string, number][] = [
  ['sindarosa', 1],
  ['curomo', 2],
  ['rokcore', 3],
  ['cyclonius', 4],
];

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const probe = async (page: Page): Promise<Probe | undefined> => {
  await frames(page);
  return page.evaluate<Probe | undefined>(`window.__TTE__.arena.ownElement()`);
};
const step = (page: Page, n: number): Promise<unknown> => page.evaluate(`window.__TTE__.arena.step(${String(n)})`);

/** Both fighters are the same race; force that race's stage, then put the given characters at the middle of the first patch. */
async function setup(page: Page, race: string, kind: number, both: boolean): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption(race);
  await page.getByLabel('AI race').selectOption(race);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await step(page, INTRO);
  await page.evaluate(`window.__TTE__.arena.setWeatherCharge(0, 1000)`);
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(WEATHER)}, 0])`);
  await step(page, 60);
  await frames(page);
  const read = (): Promise<{ stage: number; rects: number[] } | undefined> => page.evaluate(`window.__TTE__.arena.terrain()`);
  await expect.poll(async () => (await read())?.stage).toBe(kind);
  const t = await read();
  await placeAt(page, t?.rects ?? [], both);
}

async function placeAt(page: Page, r: number[], both: boolean): Promise<void> {
  const x = (r[0] ?? 0) + (r[2] ?? 0) / 2 - 40;
  const y = (r[1] ?? 0) + (r[3] ?? 0) / 2 - 40;
  await page.evaluate(
    `(() => { const a = window.__TTE__.arena; for (const c of a.characters()) { if (c.team === 0 || ${String(both)}) a.place(c.id, ${String(x)}, ${String(y)}, 0); else a.place(c.id, 1, 205, 0); } a.step(1); })()`,
  );
}

for (const [race, kind] of RACES) {
  test(`${race}: the element ${String(kind)} effect starts on its patch and stops on leaving`, async ({ page }) => {
    const errors = collectErrors(page);
    await setup(page, race, kind, false);
    const on = await probe(page);
    // The foe is parked at the top-left corner (off every patch) so only our fighter shows the effect.
    expect(on?.active.map((a) => ({ team: a.team, kind: a.kind }))).toEqual([{ team: 0, kind }]);
    expect(on?.parts).toBeGreaterThanOrEqual(5);
    expect(on?.reduced).toBe(false);
    const age = on?.active[0]?.age ?? -1;
    await step(page, 20);
    expect((await probe(page))?.active[0]?.age).toBeGreaterThan(age);
    if (SHOT_DIR) {
      mkdirSync(SHOT_DIR, { recursive: true });
      await page.locator('#game canvas').screenshot({ path: `${SHOT_DIR}/own-${race}.png` });
    }
    // Off every patch: the effect is gone the next frame.
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const me = a.characters().find((c) => c.team === 0); a.place(me.id, 1, 205, 0); a.step(1); })()`);
    expect((await probe(page))?.active).toEqual([]);
    expect((await probe(page))?.parts).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('water: a heal tick on the patch shows the plus pulse', async ({ page }) => {
  await setup(page, 'curomo', 2, false);
  const rects = (await page.evaluate<{ rects: number[] } | undefined>(`window.__TTE__.arena.terrain()`))?.rects ?? [];
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const me = a.characters().find((c) => c.team === 0); a.setHp(me.id, 20); })()`);
  await probe(page);
  let pulsed = false;
  for (let i = 0; i < 20 && !pulsed; i++) {
    await placeAt(page, rects, false);
    await step(page, 10);
    pulsed = (await probe(page))?.active.some((a) => a.pulse) ?? false;
  }
  expect(pulsed).toBe(true);
});

test('both teams show the effect when both stand on their own patch', async ({ page }) => {
  await setup(page, 'sindarosa', 1, true);
  const on = await probe(page);
  expect(on?.active.map((a) => a.team).sort()).toEqual([0, 1]);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('a static glow: ages advance but the drawn parts do not change', async ({ page }) => {
    await setup(page, 'rokcore', 3, false);
    const a = await probe(page);
    expect(a?.reduced).toBe(true);
    expect(a?.active).toHaveLength(1);
    expect(a?.parts).toBeGreaterThan(0);
    await step(page, 25);
    expect((await probe(page))?.parts).toBe(a?.parts);
  });
});
