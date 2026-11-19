import { expect, test } from '@playwright/test';
import { goToHash, START } from './parity/helpers';

const shotDir = process.env['SHOT_DIR'];

test.use({ viewport: { width: 1280, height: 720 } });

test('Key Bindings opens at the top even after scrolling Settings down', async ({ page }) => {
  await page.goto(START);
  await goToHash(page, '#settings');
  await page.locator('#settingsAdvanced > summary').click();
  await page.evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  expect(await page.evaluate<number>(`window.scrollY`)).toBeGreaterThan(100);
  await goToHash(page, '#keyBindings');
  if (shotDir) await page.screenshot({ path: `${shotDir}/key-bindings.png` });
  await expect(page.getByRole('heading', { name: 'Key Bindings' })).toBeInViewport();
  await expect(page.locator('#bind-up-0')).toBeInViewport();
  expect(await page.evaluate<number>(`window.scrollY`)).toBe(0);
});
