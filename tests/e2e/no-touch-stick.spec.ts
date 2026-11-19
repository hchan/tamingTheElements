import { expect, test } from '@playwright/test';
import { START } from './parity/helpers';

// The virtual move stick is absent with a mouse on a desktop viewport.

test('no stick for a mouse desktop', async ({ page }) => {
  await page.goto(`${START}&ff=arcade`);
  await page.getByRole('button', { name: 'Versus', exact: true }).click();
  await page.getByRole('button', { name: 'Fight' }).click();
  await expect(page.locator('#arcadeSuper')).toBeVisible();
  await expect(page.locator('#touchStick')).toBeHidden();
});
