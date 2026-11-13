import { expect, test } from '@playwright/test';
import { ARENA_READY, collectErrors, fixture, seedViaGameMaster, startBattle } from './parity/helpers';

// The test hook records every playSfx request (`kind:element`), so wiring is asserted without an audio device.
const log = (page: import('@playwright/test').Page): Promise<string[]> => page.evaluate<string[]>(`window.__TTE__.sfxLog.slice()`);

test('menu clicks ask for a click cue, and battle hits and casts ask for element cues', async ({ page }) => {
  const errors = collectErrors(page);
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.goto('/?seed=7');
  await page.waitForFunction(`window.__TTE__?.ready === true`);
  const before = (await log(page)).length;
  await page.locator('#menu button.clickable').first().click();
  await expect.poll(async () => (await log(page)).slice(before).filter((c) => c.startsWith('click:') || c.startsWith('confirm:')).length).toBeGreaterThan(0);

  await page.evaluate(`window.location.hash = '#main'`);
  await startBattle(page, 'enterPracticeContainer');
  await page.waitForFunction(ARENA_READY);
  // Manual stepping: random bots fight; a hit lands within a few seconds of sim time.
  await page.evaluate(`window.__TTE__.step(1500)`);
  const entries = await log(page);
  expect(entries.some((c) => /^hit:(fire|air|earth|water|void)$/.test(c))).toBe(true);
  expect(errors).toEqual([]);
});
