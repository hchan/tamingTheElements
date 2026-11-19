import { expect, test } from '@playwright/test';
import { collectErrors, newGameToGarrison } from './parity/helpers';

const ARENA_READY = `window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`;

test('starting and exiting a battle 3 times leaves 0 listeners each time and no errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await newGameToGarrison(page);

  for (let i = 0; i < 3; i++) {
    await page.locator('#garrisonTable .garrisonRow').first().click();
    await page.locator('#enterPracticeContainer').click();
    await page.waitForFunction(ARENA_READY);
    expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBeGreaterThan(0);

    await page.evaluate(`window.location.hash = '#main'`);
    await page.evaluate(`window.__TTE__.settled()`);
    await expect(page.locator('#game canvas')).toHaveCount(0);
    expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);

    await page.evaluate(`window.location.hash = '#garrison'`);
  }
  expect(errors).toEqual([]);
});
