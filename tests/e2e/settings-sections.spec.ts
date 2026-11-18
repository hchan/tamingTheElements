import { expect, test } from '@playwright/test';
import { goToHash, START } from './parity/helpers';

const shotDir = process.env['SHOT_DIR'];

test('Settings is grouped, Advanced is collapsed and Save stays reachable', async ({ page }) => {
  await page.goto(START);
  await goToHash(page, '#settings');
  await expect(page.locator('#settingsAudio')).toHaveJSProperty('open', true);
  await expect(page.locator('#settingsAdvanced')).toHaveJSProperty('open', false);
  await expect(page.locator('#cheatsMenu')).toBeHidden();
  await expect(page.locator('#unlockGarrison')).toBeHidden();
  const height = await page.evaluate<number>(`document.documentElement.scrollHeight`);
  expect(height).toBeLessThan(2000);
  if (shotDir) await page.screenshot({ path: `${shotDir}/settings-1280.png` });
  await page.locator('#settingsAdvanced > summary').click();
  await expect(page.locator('#cheatsMenu')).toBeVisible();
  // Save and Back are sticky at the top: still on screen after scrolling to the bottom.
  await page.evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
  await expect(page.getByRole('link', { name: 'Back' })).toBeInViewport();
});

test.describe('phone landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  test('Save stays in view while scrolling', async ({ page }) => {
    await page.goto(START);
    await goToHash(page, '#settings');
    await page.evaluate(`window.scrollTo(0, 600)`);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
    if (shotDir) await page.screenshot({ path: `${shotDir}/settings-phone-scrolled.png` });
  });
  test('title and bar are compact: first controls start in the top half', async ({ page }) => {
    await page.goto(START);
    await goToHash(page, '#settings');
    const bar = await page.locator('.settingsBar').boundingBox();
    expect(bar?.height ?? 999).toBeLessThan(70);
    const first = await page.locator('#settingsAudio .settingsGroup').first().boundingBox();
    expect(first?.y ?? 999).toBeLessThan(160);
    await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(1);
    if (shotDir) await page.screenshot({ path: `${shotDir}/settings-phone-top.png` });
  });
});
