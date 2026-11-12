import { expect, test } from '@playwright/test';
import { collectErrors, fixture, seedViaGameMaster, waitForRoute } from './parity/helpers';

test('Help lists the controls without banned words', async ({ page }) => {
  const errors = collectErrors(page);
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.goto('/?seed=7');
  await page.getByRole('heading', { level: 1, name: 'Taming the Elements' }).waitFor();
  await page.evaluate(`window.location.hash = '#help'`);
  await waitForRoute(page, '#help');
  const menu = page.locator('#menu');
  await expect(menu.getByRole('heading', { level: 2, name: 'Controls' })).toBeVisible();
  const p1 = menu.getByRole('table', { name: 'Keyboard, Player 1' });
  await expect(p1).toBeVisible();
  await expect(menu.getByRole('table', { name: /Player 2/ })).toBeVisible();
  await expect(menu.getByRole('table', { name: 'Gamepad' })).toBeVisible();
  await expect(menu.getByRole('table', { name: 'Touch' })).toBeVisible();
  await expect(p1.getByRole('row', { name: /^Trap Z or 0$/ })).toBeVisible();
  expect(await menu.innerText()).not.toMatch(/classic|arcade|ruleset|capture/i);
  expect(errors).toEqual([]);
});
