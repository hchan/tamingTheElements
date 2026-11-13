import { expect, test } from '@playwright/test';
import { collectErrors, fixture, seedViaGameMaster, waitForRoute } from './parity/helpers';

test('Help links to the Guide: wheel, ability cards and weather cards, no banned words', async ({ page }) => {
  const errors = collectErrors(page);
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.goto('/?seed=7');
  await page.getByRole('heading', { level: 1, name: 'Taming the Elements' }).waitFor();
  await page.evaluate(`window.location.hash = '#help'`);
  await waitForRoute(page, '#help');
  const menu = page.locator('#menu');
  await menu.getByRole('link', { name: 'Guide' }).click();
  await waitForRoute(page, '#guide');
  await expect(menu.getByRole('heading', { level: 1, name: 'Guide' })).toBeVisible();
  await expect(menu.getByRole('heading', { level: 2, name: 'Element wheel' })).toBeVisible();
  await expect(menu.locator('svg.guideWheel g.guideArrow')).toHaveCount(4);
  await expect(menu.locator('.guideCommon')).toHaveCount(8);
  await expect(menu.locator('.guideElemental')).toHaveCount(4);
  await expect(menu.locator('.guideWeather')).toHaveCount(5);
  await expect(menu.locator('g.guideArrow').first()).toContainText('x1.25');
  expect(await menu.innerText()).not.toMatch(/classic|arcade|ruleset|capture/i);
  await menu.getByRole('link', { name: 'Back' }).click();
  await waitForRoute(page, '#help');
  expect(errors).toEqual([]);
});
