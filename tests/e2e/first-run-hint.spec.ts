import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors, tapTourSplash } from './parity/helpers';

// The first battle shows a short "First blood" card; Got it removes it and the choice is remembered.
test('first-run hint shows, dismisses and is remembered', async ({ page }) => {
  const errors = collectErrors(page);
  const fight = async (): Promise<void> => {
    await page.goto(`${START}&ff=arcade#tour`);
    await page.getByRole('button', { name: 'Start tour' }).click();
    await page.getByRole('button', { name: 'Fight' }).click();
    await tapTourSplash(page);
    await page.waitForFunction(ARENA_READY);
  };
  await fight();
  const card = page.locator('#firstRunHint');
  await expect(card).toBeVisible();
  expect(await card.innerText()).not.toMatch(/classic|arcade|ruleset|capture/i);
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(`localStorage.getItem('tte.firstRunHint')`)).toBe('1');
  expect(errors).toEqual([]);
});
