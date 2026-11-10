import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, collectErrors, fixture, seedViaGameMaster, startBattle } from './parity/helpers';

const setHidden = (page: Page, hidden: boolean): Promise<unknown> =>
  page.evaluate(
    `Object.defineProperty(document, 'hidden', { configurable: true, get: () => ${String(hidden)} });
     document.dispatchEvent(new Event('visibilitychange'))`,
  );

test('hiding and showing the tab does not resume a battle the user paused', async ({ page }) => {
  const errors = collectErrors(page);
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.goto('/?seed=7');
  await startBattle(page, 'enterPracticeContainer');
  await page.waitForFunction(ARENA_READY);
  await page.waitForFunction(`window.__TTE__.state().tick > 0`);

  await page.keyboard.press('Shift+P');
  await page.waitForFunction(`window.__TTE__.state().paused === true`);

  await setHidden(page, true);
  await setHidden(page, false);
  expect(await page.evaluate<boolean>(`window.__TTE__.state().paused`)).toBe(true);
  const tick = await page.evaluate<number>(`window.__TTE__.state().tick`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  expect(await page.evaluate<number>(`window.__TTE__.state().tick`)).toBe(tick);

  // The user's own resume still works.
  await page.keyboard.press('Escape');
  await page.waitForFunction(`window.__TTE__.state().paused === false`);
  expect(errors).toEqual([]);
});

test('a hidden tab holds the sim and showing it again resumes it', async ({ page }) => {
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.goto('/?seed=7');
  await startBattle(page, 'enterPracticeContainer');
  await page.waitForFunction(`window.__TTE__.state().tick > 0`);
  await setHidden(page, true);
  expect(await page.evaluate<boolean>(`window.__TTE__.state().paused`)).toBe(true);
  await setHidden(page, false);
  await page.waitForFunction(`window.__TTE__.state().paused === false`);
});
