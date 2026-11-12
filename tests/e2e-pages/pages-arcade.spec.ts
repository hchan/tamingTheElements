import { expect, test } from '@playwright/test';
import { gotoMenu } from './helpers';

// The live site's way into Arcade Versus (FUN-DESIGN WP 11), on the production build under the Pages subpath: `?ff=` is
// ignored there; the entry is on by default (FUN-DESIGN 2.19), and the lazy `arcade-versus` chunk loads from the subpath.
test('production build: Arcade Versus is on the menu by default (no flag, no opt-in) and its picker loads', async ({ page }) => {
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

  await gotoMenu(page);
  await expect(page.locator('#menu .mainMenuList li button').first()).toHaveText('Play');
  await arcadeEntry.locator('button').click();
  await expect(page).toHaveURL(/#arcade$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Versus', exact: true })).toBeVisible();
  await expect(page.getByLabel('Your race')).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.locator('#menu .mainMenuList')).toBeVisible();
  expect(errors).toEqual([]);
});
