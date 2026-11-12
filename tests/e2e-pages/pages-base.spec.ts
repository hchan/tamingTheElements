import { expect, test } from '@playwright/test';
import { gotoMenu } from './helpers';

test('menu loads under the /tamingTheElements/ subpath with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${String(r.status())} ${r.url()}`);
  });

  await gotoMenu(page);
  await expect(page.locator('#versionStamp')).toHaveText(/^v\d+\.\d+\.\d+\S* \(([0-9a-f]{7,}|unknown)\)$/);

  // Hash routing needs no server rewrite: a hash route stays on the same document under the base.
  // The 5-entry menu has no About entry (it lives under Help), so go Help, then its About link.
  await page.locator('#menu .mainMenuList li[data-route="help"] button').click();
  await expect(page).toHaveURL(/\/tamingTheElements\/#help$/);
  await page.locator('li[data-route="about"] a').click();
  await expect(page).toHaveURL(/\/tamingTheElements\/#about$/);
  await expect(page.locator('#aboutVersion')).toBeVisible();

  expect(errors).toEqual([]);
});
