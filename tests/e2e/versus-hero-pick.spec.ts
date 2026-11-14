import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Versus hero pick (QA r21): ONE click on a roster tile picks that hero (selected state, "You" card, Fight uses it), and the
// dev/test-only `?hero=` / `?foe=` flags start a fight with chosen heroes so QA can test any hero.

/** Max life per team of the active fighters (each hero has its own: Fiara 130, Treenoc 90, Sindarosa 100, Rokcore 120). */
const lives = (page: Page): Promise<number[]> =>
  page.evaluate<number[]>(`window.__TTE__.arena.characters().sort((a, b) => a.team - b.team).map((c) => c.maxHp)`);

test('Versus: a single click picks the hero, shows it selected, and Fight starts with it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  const tile = page.locator('.heroTile', { hasText: 'Fiara' });
  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.vsSide1 .vsStatus')).toHaveText('Picked');
  await expect(page.locator('.vsSide1 .rosterSlot').first()).toContainText('Fiara');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate('window.__TTE__.arena.step(1)');
  const l = await lives(page);
  expect(l[0], l.join()).toBeGreaterThan(l[1] ?? 0);
  expect(l[0]).not.toBe(100);
  expect(errors).toEqual([]);
});

test('Versus: a keyboard Enter on a focused tile picks it too', async ({ page }) => {
  await page.goto(`${START}&ff=arcade#arcade`);
  const tile = page.locator('.heroTile', { hasText: 'Ishimi' });
  await tile.focus();
  await page.keyboard.press('Enter');
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
});

test('?hero= and ?foe= start a fight with the chosen heroes (dev/test builds)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?manual=1&seed=7&hero=fiara&foe=treenoc');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate('window.__TTE__.arena.step(1)');
  await expect.poll(async () => (await lives(page)).length).toBe(2);
  expect(await lives(page)).toEqual([130, 90]);
  expect(errors).toEqual([]);
});
