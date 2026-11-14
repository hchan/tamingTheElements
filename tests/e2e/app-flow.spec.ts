import { expect, test, type Page } from '@playwright/test';
import { newGameToGarrison } from './parity/helpers';

// Page-side code is passed as strings because tsconfig.node has no DOM lib.
const ARENA_READY = `window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || /has no frame|missing frame/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('garrison rows show a loaded avatar, and a selection fills a labelled slot', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  await page.goto('/');
  await newGameToGarrison(page);
  const row = page.locator('#garrisonTable .garrisonRow').first();
  await expect(row.locator('.garrisonAvatar')).toHaveCSS('background-image', /assets\/img\/map\/.+\.png/);
  await expect(page.locator('.teamSlot').first()).toContainText('Empty');
  await row.click();
  await expect(page.locator('.teamSlot').first()).not.toContainText('Empty');
  await expect(row.locator('.battlegroundOrderContainer')).toHaveText('Slot 1');
  expect(failed).toEqual([]);
});

test('new game -> garrison -> battle renders the arena, pause works, exit leaves no listeners', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await newGameToGarrison(page);
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
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});
