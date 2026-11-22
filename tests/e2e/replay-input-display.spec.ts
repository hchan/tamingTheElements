import { expect, test } from '@playwright/test';
import { collectErrors } from './parity/helpers';

const GOLDEN = new URL('../fixtures/replays/random-vs-random.replay.json', import.meta.url).pathname;

test('the replay viewer shows both fighters inputs and the display can be toggled', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/#replay');
  await page.locator('#replayFile').setInputFiles(GOLDEN);
  await page.waitForFunction(`window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`);
  await page.locator('#replay2x').click();
  await page.locator('#replayPause').click();

  await expect(page.locator('#inputDisplay')).toBeVisible();
  await expect(page.locator('#inputList1 li').first()).toBeVisible();
  await expect(page.locator('#inputList2 li').first()).toBeVisible();
  expect(await page.locator('#inputList1 li').count()).toBeGreaterThan(0);

  await page.locator('#replayInputs').click();
  await expect(page.locator('#inputDisplay')).toBeHidden();
  await page.locator('#replayInputs').click();
  await expect(page.locator('#inputDisplay')).toBeVisible();

  // Stepping while paused keeps the display in step with the tick counter.
  const before = await page.locator('#inputList1').getAttribute('data-key');
  for (let i = 0; i < 30; i++) await page.locator('#replayStep').click();
  await expect.poll(() => page.locator('#inputList1').getAttribute('data-key')).not.toBe(before);

  await page.evaluate(`window.location.hash = '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  expect(errors).toEqual([]);
});
