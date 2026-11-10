import { expect, test, type Page } from '@playwright/test';

// Page-side code is passed as strings because tsconfig.node has no DOM lib.
const ARENA_READY = `window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('new game -> garrison -> battle renders the arena, pause works, exit leaves no listeners', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByText('New Game', { exact: true }).click();
  await page.locator('#garrisonTable .garrisonRow').first().click();
  await page.locator('#enterPracticeContainer').click();

  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  expect(await page.evaluate<string>(`window.__TTE__.state().route`)).toBe('#loading');
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBeGreaterThan(0);

  await page.keyboard.press('Shift+P');
  await page.waitForFunction(`window.__TTE__.state().paused === true`);
  const tick = await page.evaluate<number>(`window.__TTE__.state().tick`);
  await page.evaluate(`window.__TTE__.step(25)`);
  expect(await page.evaluate<number>(`window.__TTE__.state().tick`)).toBe(tick + 25);
  expect(await page.evaluate<number>(`window.__TTE__.arena.characters().length`)).toBe(2);

  // Exit to the menu: the game is destroyed and its listeners are released (no page reload).
  await page.evaluate(`window.location.hash = '#main'`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});
