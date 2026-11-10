import { expect, test } from '@playwright/test';

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

  await page.goto('/tamingTheElements/');
  await expect(page.locator('#menu .mainMenuList')).toBeVisible();
  await expect(page.locator('#versionStamp')).toHaveText(/^v\d+\.\d+\.\d+\S* \(([0-9a-f]{7,}|unknown)\)$/);

  // Hash routing needs no server rewrite: a hash route stays on the same document under the base.
  await page.locator('li[data-route="about"]').click();
  await expect(page).toHaveURL(/\/tamingTheElements\/#about$/);

  expect(errors).toEqual([]);
});
