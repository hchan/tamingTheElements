import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Arcade trap input and markers (WP 39b, docs/ideas wp39): Z sends the Trap command, a marker with its words appears on
// the floor, the Trap slot and touch button show the cooldown; 0 listeners after leaving. Page-side code is passed as
// strings (no DOM lib in tsconfig.node).

interface Marker {
  kind: number;
  team: number;
  label: string;
}

/** Round 1's intro (FUN-DESIGN 2.10): nobody acts until tick 91. */
const INTRO = 91;

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const traps = async (page: Page): Promise<readonly Marker[] | undefined> => {
  await frames(page);
  return page.evaluate<readonly Marker[] | undefined>(`window.__TTE__.arena.traps()`);
};

async function start(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('pax');
  await page.getByLabel('AI race').selectOption('sindarosa');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 300, 360, 0); a.place(foe.id, 1500, 360, 4); })()`);
}

test('Arcade Versus: Z lays a trap with its words and starts the cooldown; 0 listeners after', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await expect(page.locator('#arcadeTrap')).toBeVisible();
  expect(await traps(page)).toEqual([]);
  await page.keyboard.down('KeyZ');
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.keyboard.up('KeyZ');
  await page.evaluate(`window.__TTE__.arena.stepLive(4)`);
  const t = await traps(page);
  expect(t?.length).toBe(1);
  expect(t?.[0]?.team).toBe(0);
  expect(t?.[0]?.label).toMatch(/^P1 (Fire Bomb|Puddle|Spike|Gust)/);
  await expect.poll(async () => { await frames(page); return page.locator('#arcadeTrap').innerText(); }, { timeout: 5000 }).toMatch(/\d+s/);

  await page.keyboard.press('Shift+P');
  await page.waitForFunction(`window.__TTE__.arena.paused === false`);
  await page.keyboard.press('Shift+P');
  await page.getByRole('link', { name: 'Exit to menu' }).click();
  await page.waitForFunction(`window.location.hash === '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  await expect(page.locator('#arcadeTrap')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});

test('the touch Trap button lays a trap', async ({ page }) => {
  await start(page);
  await page.locator('#arcadeTrap').hover();
  await page.mouse.down();
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.mouse.up();
  await page.evaluate(`window.__TTE__.arena.stepLive(4)`);
  expect((await traps(page))?.length).toBe(1);
});
