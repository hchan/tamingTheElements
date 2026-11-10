import { expect, test } from '@playwright/test';
import { CINEMATIC_READY } from './parity/helpers';

// After a skip the scene shuts down and clears its probe, so 'finished' is either true or the probe is gone.
const CINEMATIC_DONE = `!window.__TTE__ || !window.__TTE__.cinematic || window.__TTE__.cinematic.finished === true`;

const REPEAT = `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', repeat: true }))`;

test('Escape skips the cinematic; auto-repeat of Enter does nothing', async ({ page }) => {
  await page.goto('/?ff=cinematicDemo');
  await page.waitForFunction(CINEMATIC_READY);
  await page.evaluate(REPEAT);
  await page.evaluate(`window.__TTE__.settled()`);
  expect(await page.evaluate<boolean>(`window.__TTE__.cinematic.finished`)).toBe(false);
  await page.keyboard.press('Escape');
  await page.waitForFunction(CINEMATIC_DONE);
});

test('Enter skips the cinematic', async ({ page }) => {
  await page.goto('/?ff=cinematicDemo');
  await page.waitForFunction(CINEMATIC_READY);
  await page.keyboard.press('Enter');
  await page.waitForFunction(CINEMATIC_DONE);
});
