import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters, collectErrors } from './parity/helpers';

// Local two-player Arcade Versus: the picker's "Two players (this computer)" option, Player 1 on the usual keys and Player 2 on
// I J K L / U / O / Y / N / B (src/game/input/local-two.ts). Both fighters are driven by real key presses (the arena reads the
// keyboard on each live tick); `manual=1` starts the arena paused, so every tick is stepped. Page-side code is passed as strings.
const INTRO = 91;
const stepLive = (page: Page, n: number): Promise<unknown> => page.evaluate(`window.__TTE__.arena.stepLive(${String(n)})`);

async function start(page: Page): Promise<{ p1: number; p2: number }> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Opponent').selectOption('local');
  await expect(page.getByLabel('Player 1 race')).toBeVisible();
  await expect(page.getByLabel('Player 2 race')).toBeVisible();
  await expect(page.getByLabel('AI level')).toBeDisabled();
  await expect(page.locator('#arcadeLocalHelp')).toBeVisible();
  await page.getByLabel('Player 1 race').selectOption('sindarosa');
  await page.getByLabel('Player 2 race').selectOption('sindarosa');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  const [a] = await characters(page, 0);
  const [b] = await characters(page, 1);
  if (!a || !b) throw new Error('both fighters must be in the arena');
  return { p1: a.id, p2: b.id };
}

const at = async (page: Page, id: number): Promise<{ x: number; y: number; hp: number; maxHp: number }> => {
  const c = (await page.evaluate<{ id: number; x: number; y: number; hp: number; maxHp: number }[]>(`window.__TTE__.arena.characters()`)).find((k) => k.id === id);
  if (!c) throw new Error('missing fighter');
  return c;
};

test('both players move with their own keys and the keys are listed on the battle screen', async ({ page }) => {
  const errors = collectErrors(page);
  const { p1, p2 } = await start(page);
  await expect(page.locator('#arcadeKeysHint')).toContainText('Player 2: I J K L move');
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.place(${String(p1)}, 400, 360, 0); a.place(${String(p2)}, 800, 360, 4); })()`);
  const before = { a: await at(page, p1), b: await at(page, p2) };
  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyI');
  await stepLive(page, 25);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyI');
  const after = { a: await at(page, p1), b: await at(page, p2) };
  expect(after.a.x).toBeGreaterThan(before.a.x);
  expect(after.a.y).toBe(before.a.y);
  expect(after.b.y).toBeLessThan(before.b.y);
  expect(after.b.x).toBe(before.b.x);
  expect(errors).toEqual([]);
});

test('both players attack with their own keys: each hero hurts the other', async ({ page }) => {
  const { p1, p2 } = await start(page);
  const line = (): Promise<unknown> =>
    page.evaluate(`(() => { const a = window.__TTE__.arena; a.place(${String(p1)}, 500, 360, 0); a.place(${String(p2)}, 700, 360, 4); })()`);
  // Player 1 alone: Space fires; only Player 2's hero is hurt.
  await line();
  await page.keyboard.down('Space');
  await stepLive(page, 60);
  await page.keyboard.up('Space');
  await stepLive(page, 60);
  expect((await at(page, p2)).hp).toBeLessThan((await at(page, p2)).maxHp);
  expect((await at(page, p1)).hp).toBe((await at(page, p1)).maxHp);
  // Then Player 2 alone: U fires; Player 1's hero is hurt.
  await line();
  await page.keyboard.down('KeyU');
  await stepLive(page, 60);
  await page.keyboard.up('KeyU');
  await stepLive(page, 60);
  expect((await at(page, p1)).hp).toBeLessThan((await at(page, p1)).maxHp);
});
