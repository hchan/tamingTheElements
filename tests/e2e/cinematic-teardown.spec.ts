import { expect, test } from '@playwright/test';
import { collectErrors } from './parity/helpers';

const CINEMATIC_READY = `window.__TTE__ && window.__TTE__.scene === 'Cinematic' && !!window.__TTE__.cinematic`;

test('skipping the cinematic removes every listener', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?ff=cinematicDemo');
  await page.waitForFunction(CINEMATIC_READY);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBeGreaterThan(0);

  await page.evaluate(`window.__TTE__.cinematic.skip()`);
  await page.waitForFunction(`window.__TTE__.scene === undefined`);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});

test('destroying the game mid-cinematic removes every listener once Phaser has destroyed', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?ff=cinematicDemo');
  await page.waitForFunction(CINEMATIC_READY);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBeGreaterThan(0);

  await page.evaluate(`window.__TTE__.cinematic.destroyGame()`);
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});
