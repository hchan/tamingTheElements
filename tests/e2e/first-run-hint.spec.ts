import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// The Tour has no in-fight card (its stage card names the controls); the card is shown in Versus. The first battle shows a short "First blood" card; Got it removes it and the choice is remembered.
// QA r49/r50: a super cut-in removes the card on the spot, so it never sits over the cut-in band.
test('first-run hint is gone the moment a super cut-in starts', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: /^Fight/ }).click();
  await page.waitForFunction(ARENA_READY);
  const card = page.locator('#firstRunHint');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await page.evaluate(`window.dispatchEvent(new Event('tte:super-cut'))`);
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('first-run hint shows, dismisses and is remembered', async ({ page }) => {
  const errors = collectErrors(page);
  const fight = async (): Promise<void> => {
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByRole('button', { name: /^Fight/ }).click();
    await page.waitForFunction(ARENA_READY);
  };
  await fight();
  const card = page.locator('#firstRunHint');
  await expect(card).toBeVisible({ timeout: 15_000 });
  expect(await card.innerText()).not.toMatch(/classic|arcade|ruleset|capture/i);
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(`localStorage.getItem('tte.firstRunHint')`)).toBe('1');
  expect(errors).toEqual([]);
});

// QA r18: at 720p the card is a slim strip clear of the action bar, and it fades by itself soon.
test('first-run hint at 1280x720 is a slim strip above the bar and fades on its own', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: /^Fight/ }).click();
  await page.waitForFunction(ARENA_READY);
  const card = page.locator('#firstRunHint');
  await expect(card).toBeVisible({ timeout: 15_000 });
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.height ?? 999).toBeLessThan(100);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThan(720 * 0.92);
  await expect(page.locator('#firstRunHint:not(.firstRunFade)')).toHaveCount(0, { timeout: 15_000 }); // faded, or already removed (PHONE-2)
  expect(errors).toEqual([]);
});

// QA r43: on a 667x375 phone the card sits in the top band, clear of the lower-left fighting area and the thumb pads.
test.describe('phone', () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
  test('first-run hint at 667x375 stays out of the lower fighting area', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByRole('button', { name: /^Fight/ }).tap();
    await page.waitForFunction(ARENA_READY);
    const card = page.locator('#firstRunHint');
    await expect(card).toBeVisible({ timeout: 15_000 });
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 999) + (box?.height ?? 999)).toBeLessThan(375 * 0.5);
    expect(errors).toEqual([]);
  });
});
