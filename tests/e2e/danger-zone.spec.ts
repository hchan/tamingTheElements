import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Melee danger-zone outline (ability-telegraphs, first slice): Ground Shock's 240x240 hit box is outlined at its true size,
// pulsing when motion is allowed and steady under reduced motion. Page-side code is passed as strings (no DOM lib).

interface Zone {
  w: number;
  h: number;
  alpha: number;
}
const INTRO = 91;
/** Secondary ability (Pax: Ground Shock). */
const SECONDARY = 32;

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

async function cast(page: Page): Promise<readonly Zone[] | undefined> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('pax');
  await page.getByLabel('AI race').selectOption('sindarosa');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 700, 360, 0); a.place(foe.id, 1500, 360, 4); })()`);
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(SECONDARY)}, 0])`);
  await frames(page);
  return page.evaluate<readonly Zone[] | undefined>(`window.__TTE__.arena.dangerZones()`);
}

test('Ground Shock: the true 240x240 box is outlined, pulsing, with no page errors', async ({ page }, info) => {
  const errors = collectErrors(page);
  const zones = await cast(page);
  expect(zones?.length).toBe(1);
  expect(zones?.[0]).toMatchObject({ w: 240, h: 240 });
  expect(zones?.[0]?.alpha).toBe(1);
  expect((await page.locator('#game canvas').screenshot({ path: info.outputPath('ground-shock.png') })).length).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('Ground Shock outline is steady, not pulsing', async ({ page }) => {
    const zones = await cast(page);
    expect(zones?.[0]).toMatchObject({ w: 240, h: 240, alpha: 0.55 });
  });
});
