import { expect, test } from '@playwright/test';
import { collectErrors } from './parity/helpers';

// QA r67: for one pinned Tour seed, the stage card, the versus splash and the started fight agree on the opponents and the arena element.
const KIND: Record<string, number> = { Fire: 1, Water: 2, Earth: 3, Air: 4 };

test('Tour card, splash and fight agree for ?seed=42', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?manual=1&seed=42&ff=arcade,holdSplash#tour');
  await page.getByLabel('Hero 1 (lead)').selectOption('sindarosa');
  await page.getByLabel('Hero 2').selectOption('pax');
  await page.getByLabel('Hero 3').selectOption('curomo');
  await page.getByRole('button', { name: 'Start tour' }).click();
  const card = page.locator('#tourStage');
  const place = ((await card.locator('[data-fact="location"] .tourFactValue').textContent()) ?? '').trim();
  const foes = ((await card.locator('[data-fact="opponent"] .tourFactValue').textContent()) ?? '').trim().split(', ');
  expect(KIND[place]).toBeGreaterThan(0);
  // Enter starts the fight (QA r67: the pulsing button is focused); the splash is held by ff=holdSplash.
  await page.keyboard.press('Enter');
  await expect(page.locator('.vsStageName')).toHaveText(`${place} arena`);
  const lead = ((await page.locator('.vsName').nth(1).textContent()) ?? '').replace(/^Opponent: /, '').replace(/ \([^)]*\)/g, '');
  const bench = (await page.locator('ul.vsBench').last().locator('.vsBenchName').allTextContents()).map((s) => s.replace(/ \([^)]*\)/g, ''));
  expect([lead, ...bench]).toEqual(foes);
  await page.keyboard.press('Enter');
  await expect(page.locator('#game canvas')).toBeVisible();
  await page.waitForFunction(`window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`);
  // Past the round intro; the view draws on the next frames.
  await page.evaluate('window.__TTE__.arena.step(91)');
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const stage = async (): Promise<number> => (await page.evaluate<{ stage: number } | undefined>('window.__TTE__.arena.terrain()'))?.stage ?? 0;
  await expect.poll(stage, { timeout: 20_000 }).toBe(KIND[place]);
  expect(errors).toEqual([]);
});
