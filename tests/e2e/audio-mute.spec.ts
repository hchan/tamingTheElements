import { expect, test } from '@playwright/test';
import { ARENA_READY, collectErrors, fixture, seedViaGameMaster, startBattle } from './parity/helpers';

test('Ctrl-M toggles mute in a battle, the first key press unlocks audio, and the choice persists', async ({ page }) => {
  const errors = collectErrors(page);
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.goto('/?seed=7');
  await startBattle(page, 'enterPracticeContainer');
  await page.waitForFunction(ARENA_READY);
  await page.waitForFunction(`window.__TTE__.arena.audio() !== undefined`);
  expect(await page.evaluate<boolean>(`window.__TTE__.arena.audio().muted`)).toBe(false);

  await page.keyboard.press('Control+m');
  await page.waitForFunction(`window.__TTE__.arena.audio().muted === true`);
  expect(await page.evaluate<boolean>(`window.__TTE__.arena.audio().unlocked`)).toBe(true);
  expect(await page.evaluate<string | null>(`window.localStorage.getItem('Taming the Elements.muted')`)).toBe('1');

  await page.keyboard.press('Control+m');
  await page.waitForFunction(`window.__TTE__.arena.audio().muted === false`);

  await page.evaluate(`window.location.hash = '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});
