import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Fire Blast trail and impact fade with the damage falloff (FUN-DESIGN 2.27, view only): Sindarosa casts a blast across the
// arena; a screenshot early in flight (full strength) and late (faded) land in the test output dir for a visual check.
const INTRO = 91;
const PRIMARY = 16;
const frames = (page: import('@playwright/test').Page): Promise<unknown> =>
  page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

test('Fire Blast: early and late flight render without page errors', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('sindarosa');
  await page.getByLabel('AI race').selectOption('pax');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(${String(INTRO)}); const [me, foe] = a.characters(); a.place(me.id, 100, 360, 0); a.place(foe.id, 1800, 360, 4); })()`);
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(PRIMARY)}, 0])`);
  let at = 1;
  for (const [name, tick] of [['early', 14], ['mid', 40], ['late', 75]] as const) {
    await page.evaluate(`window.__TTE__.arena.step(${String(tick - at)}, [0, 0])`);
    at = tick;
    await frames(page);
    const png = await page.locator('#game canvas').screenshot({ path: info.outputPath(`${name}.png`) });
    expect(png.length).toBeGreaterThan(2000);
  }
  expect(errors).toEqual([]);
});
