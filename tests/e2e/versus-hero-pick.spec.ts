import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';
import { waitForArena } from './support/wait';

// Versus hero pick (QA r21): ONE click on a roster tile picks that hero (selected state, "You" card, Fight uses it), and the
// dev/test-only `?hero=` / `?foe=` flags start a fight with chosen heroes so QA can test any hero.

/** Max life per team of the active fighters (each hero has its own: Fiara 130, Treenoc 90, Sindarosa 100, Rokcore 120). */
const lives = (page: Page): Promise<number[]> =>
  page.evaluate<number[]>(`window.__TTE__.arena.characters().sort((a, b) => a.team - b.team).map((c) => c.maxHp)`);

test('Versus: a single click picks the hero, shows it selected, and Fight starts with it', { tag: '@smoke' }, async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  const tile = page.locator('.heroTile', { hasText: 'Fiara' });
  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.vsSide1 .tsRow').first()).toContainText('Fiara');
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
  // The real Versus arena scales life up per race (SIM_VERSION 86 retune: Fiara 547, Treenoc 559), so the two chosen heroes differ and neither is the plain 100.
  const l = await lives(page);
  expect(l[0], l.join()).not.toBe(l[1]);
  expect(l[0]).not.toBe(100);
  expect(errors).toEqual([]);
});

// Long gate: a 6-key sequence on a 3v3 picker; the smoke test above covers the click path.
test('Versus 3v3: Space locks three heroes in order, Q pops the last, Space on a full team fights', async ({ page }) => {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.selectOption('select[name=size]', '3');
  const rows = page.locator('.vsSide1 .tsRow');
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('KeyD');
    await page.keyboard.press('Space');
  }
  await expect(rows.nth(2)).toHaveAttribute('title', /^Remove /);
  await page.keyboard.press('KeyQ');
  await expect(rows.nth(2)).not.toHaveAttribute('title', /^Remove /);
  await page.keyboard.press('KeyD');
  await page.keyboard.press('Space');
  await expect(rows.nth(2)).toHaveAttribute('title', /^Remove /);
  await page.keyboard.press('Space');
  await waitForArena(page);
});
