import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START } from './parity/helpers';

// Water (rain) stage floor chips (QA r40): the "WATER +HP" chips sit on dark plates under the fighters, read at full alpha when nobody is near,
// and fade out of a fighter's way. The stage is forced by Curomo (water) calling its weather. Shots to $SHOT_DIR when set.
const shotDir = process.env['SHOT_DIR'];
const WEATHER = 1 << 14;
const INTRO = 91;
const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

interface Chip { x: number; y: number; w: number; h: number; alpha: number }
interface Terrain { stage: number; labels: string[]; chips: Chip[]; chipDepth: number; labelDepth: number }
const terrain = async (page: Page): Promise<Terrain> => {
  await frames(page);
  const t = await page.evaluate<Terrain | undefined>(`window.__TTE__.arena.terrain()`);
  if (!t) throw new Error('no terrain');
  return t;
};

test('water stage: chips are solid plates under the fighters, and fade near a fighter', async ({ page }, info) => {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('curomo');
  await page.getByLabel('AI race').selectOption('fiara');
  await page.getByRole('button', { name: /^Fight/ }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO + 20)})`);
  await page.evaluate(`document.querySelector('.firstRunDone')?.click()`);
  if ((await terrain(page)).stage !== 2) {
    await page.evaluate(`window.__TTE__.arena.setWeatherCharge(0, 1000)`);
    await page.evaluate(`window.__TTE__.arena.step(1, [${String(WEATHER)}, 0])`);
    await page.evaluate(`window.__TTE__.arena.step(60)`);
  }
  // Park both fighters well away from every chip so the chips read at full strength.
  const park = (): Promise<unknown> =>
    page.evaluate(`(() => { const a = window.__TTE__.arena; for (const c of a.characters()) a.place(c.id, c.team === 0 ? 60 : 1100, 640, 0); a.step(1); })()`);
  await park();
  let t = await terrain(page);
  for (let i = 0; i < 8 && t.chips.every((c) => c.alpha < 0.9); i++) t = await terrain(page);
  expect(t.stage).toBe(2);
  expect(t.labels.length).toBeGreaterThanOrEqual(3);
  expect(t.labels.every((l) => /WATER|HP|HEAL/i.test(l))).toBe(true);
  expect(t.chipDepth).toBeLessThan(-0.6);
  expect(t.labelDepth).toBeLessThan(-0.6);
  const shown = t.chips.filter((c) => c.alpha > 0);
  expect(shown.length).toBe(t.labels.length);
  for (const c of shown) expect(c.alpha).toBeGreaterThanOrEqual(0.9);
  const far = `${shotDir ?? info.outputDir}/water-chips-far.png`;
  await page.screenshot({ path: far });

  // A fighter stepping onto the first chip makes it (and only the near ones) fade; the far chips stay solid.
  const first = shown[0];
  if (!first) throw new Error('no chip');
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const me = a.characters().find((c) => c.team === 0); a.place(me.id, ${String(first.x + first.w / 2 - 40)}, ${String(first.y - 20)}, 0); a.step(1); })()`);
  for (let i = 0; i < 6; i++) t = await terrain(page);
  expect(t.chips[0]?.alpha ?? 1).toBeLessThanOrEqual(0.25);
  expect(Math.max(...t.chips.map((c) => c.alpha))).toBeGreaterThanOrEqual(0.9);
  await page.screenshot({ path: `${shotDir ?? info.outputDir}/water-chips-near.png` });
});
