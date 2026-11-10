import { expect, test, type Page } from '@playwright/test';

const ARENA_READY = `window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('starting and exiting a battle 3 times leaves 0 listeners each time and no errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByText('New Game', { exact: true }).click();

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
