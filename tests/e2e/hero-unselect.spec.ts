import { expect, test, type Page } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';

// Unselecting heroes on the Play team picker: the x button, a second click on the tile, Delete; Start waits for a full team.
const SELECTS = ['Hero 1 (lead)', 'Hero 2', 'Hero 3'] as const;
const team = async (page: Page): Promise<string[]> => Promise.all(SELECTS.map((l) => page.getByLabel(l, { exact: true }).inputValue()));

test('Play picker: remove a hero three ways, Start waits for three heroes', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#tour`);
  await page.getByLabel('Hero 1 (lead)').selectOption('fiara');
  await page.getByLabel('Hero 2').selectOption('rokcore');
  await page.getByLabel('Hero 3').selectOption('curomo');
  const start = page.locator('#tourStart');
  await expect(page.locator('.heroSlotClear')).toHaveCount(3);
  await expect(start).toBeEnabled();

  // The x button.
  await page.getByRole('button', { name: 'Remove Rokcore from slot 2' }).click();
  expect(await team(page)).toEqual(['fiara', '', 'curomo']);
  await expect(page.locator('#tourSlot2')).toContainText('Empty');
  await expect(start).toBeDisabled();
  await expect(page.locator('#tourHint')).toHaveText('Pick 1 more hero');
  await expect(page.getByRole('status')).toContainText('Rokcore removed from hero 2.');

  // Refill, then a second click on the picked tile takes it off again.
  await page.locator('.heroTile').filter({ hasText: /^Rokcore/ }).click();
  await page.getByRole('button', { name: 'Add to team' }).click();
  expect(await team(page)).toEqual(['fiara', 'rokcore', 'curomo']);
  await page.locator('.heroTile').filter({ hasText: /^Curomo/ }).click();
  await page.locator('.heroTile').filter({ hasText: /^Curomo/ }).click();
  expect(await team(page)).toEqual(['fiara', 'rokcore', '']);

  // Delete on a focused slot.
  await page.locator('#tourSlot1').focus();
  await page.keyboard.press('Delete');
  expect(await team(page)).toEqual(['', 'rokcore', '']);
  await expect(page.locator('#tourHint')).toHaveText('Pick 2 more heroes');
  await expect(start).toBeDisabled();
  expect(errors).toEqual([]);
});
