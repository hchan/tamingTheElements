import { expect, test } from '@playwright/test';
import { CINEMATIC_READY } from './parity/helpers';

const REPEAT = `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', repeat: true }))`;

test('Escape skips the cinematic; auto-repeat of Enter does nothing', async ({ page }) => {
  await page.goto('/?ff=cinematicDemo');
  await page.waitForFunction(CINEMATIC_READY);
  await page.evaluate(REPEAT);
  await page.evaluate(`window.__TTE__.settled()`);
  expect(await page.evaluate<boolean>(`window.__TTE__.cinematic.finished`)).toBe(false);
  await page.keyboard.press('Escape');
  await page.waitForFunction(`window.__TTE__.cinematic.finished === true`);
});

test('Enter skips the cinematic', async ({ page }) => {
  await page.goto('/?ff=cinematicDemo');
  await page.waitForFunction(CINEMATIC_READY);
  await page.keyboard.press('Enter');
  await page.waitForFunction(`window.__TTE__.cinematic.finished === true`);
});
