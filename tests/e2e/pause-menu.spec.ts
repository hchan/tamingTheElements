import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Pause menu in a local fight (QA r24): Escape pauses; Resume, Restart and Quit to menu.
const shotDir = process.env['SHOT_DIR'];

// No manual=1 (START): that holds the sim paused with the user reason, so Escape would resume instead of pausing.
async function enterFight(page: Page): Promise<void> {
  await page.goto('/?seed=7&ff=arcade#arcade');
  await page.getByRole('button', { name: /^Fight/ }).click();
  await page.waitForFunction(ARENA_READY);
}

test('Escape pauses a local fight and shows Resume, Restart and Quit to menu', { tag: '@smoke' }, async ({ page }) => {
  await enterFight(page);
  await page.keyboard.press('Escape');
  await page.waitForFunction(`window.__TTE__.state().paused === true`);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#pauseHint')).toContainText('Escape');
  await expect(page.locator('#pauseResume')).toBeFocused();
  await expect(page.locator('#pauseRestart')).toBeVisible();
  await expect(page.locator('#pauseExit')).toHaveText('Quit to menu');
  if (shotDir) await page.screenshot({ path: `${shotDir}/pause-desktop.png` });
  const tick = await page.evaluate<number>(`window.__TTE__.state().tick`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  expect(await page.evaluate<number>(`window.__TTE__.state().tick`)).toBe(tick);
  // Tab stays inside the dialog.
  await page.keyboard.press('Tab');
  await expect(page.locator('#pauseRestart')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.waitForFunction(`window.__TTE__.state().paused === false`);
  await expect(dialog).toBeHidden();
});

test('Restart starts the fight again', async ({ page }) => {
  await enterFight(page);
  await page.keyboard.press('Escape');
  await page.waitForFunction(`window.__TTE__.state().paused === true`);
  await page.locator('#pauseRestart').click();
  await page.waitForFunction(ARENA_READY);
  await page.waitForFunction(`window.__TTE__.state().paused === false`);
  await expect(page.locator('#pauseOverlay')).toBeHidden();
});

test('Quit to menu leaves the fight', async ({ page }) => {
  await enterFight(page);
  await page.keyboard.press('Escape');
  await page.locator('#pauseExit').click();
  await page.waitForFunction(`window.__TTE__.state().mountedRoute === '#main'`);
});
