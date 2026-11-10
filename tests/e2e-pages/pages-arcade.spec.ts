import { expect, test } from '@playwright/test';

// The live site's way into Arcade Versus (FUN-DESIGN WP 11), on the production build under the Pages subpath: `?ff=` is
// ignored there, so only the Settings opt-in shows the entry, and the lazy `arcade-versus` chunk loads from the subpath.
test('production build: ?ff=arcade does nothing, the Settings opt-in adds Arcade Versus and its picker loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${String(r.status())} ${r.url()}`);
  });
  const arcadeEntry = page.locator('li[data-route="arcade"]');

  await page.goto('/tamingTheElements/?ff=arcade');
  await expect(page.locator('#menu .mainMenuList')).toBeVisible();
  await expect(arcadeEntry).toHaveCount(0);

  await page.locator('li[data-route="settings"] button').click();
  await page.getByLabel('Arcade Versus (preview)').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/tamingTheElements\/\?ff=arcade#main$/);
  await arcadeEntry.locator('button').click();
  await expect(page).toHaveURL(/#arcade$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Arcade Versus' })).toBeVisible();
  await expect(page.getByLabel('Your race')).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.locator('#menu .mainMenuList')).toBeVisible();
  expect(errors).toEqual([]);
});
