import { expect, test, type Page } from '@playwright/test';
import {
  ARENA_READY,
  fixture,
  goToHash,
  killEnemy,
  seedViaGameMaster,
  waitForRoute,
} from './parity/helpers';

async function openBattle(page: Page, flag: string): Promise<void> {
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.goto(`/?seed=7&ff=${flag}`);
  await goToHash(page, '#garrison');
  await page.locator('#garrisonTable .garrisonRow').first().click();
  await page.locator('#enterPracticeContainer').click();
}

for (const [flag, title] of [
  ['failLoad', 'Could not load your save'],
  ['failSetup', 'The battle could not start'],
  ['failGame', 'The battle could not start'],
] as const) {
  test(`${flag}: the battle screen shows an error with a way back, no hang and no leaked listeners`, async ({ page }) => {
    await openBattle(page, flag);
    const alert = page.getByRole('alert');
    await expect(alert.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('Loading...')).toHaveCount(0);
    await expect(page.locator('#game canvas')).toHaveCount(0);
    await alert.getByRole('link', { name: 'Back to menu' }).click();
    await waitForRoute(page, '#main');
    await page.evaluate(`window.__TTE__.settled()`);
    expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  });
}

test('failSave: the result is still shown with a clear message and a retry that works', async ({ page }) => {
  await openBattle(page, 'failSave');
  await page.waitForFunction(ARENA_READY);
  await killEnemy(page);
  await waitForRoute(page, '#victory');
  await expect(page.getByRole('heading', { name: 'Victory!' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Could not save progress');
  await page.locator('#retrySave').click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('#retrySave')).toHaveCount(0);
  await page.evaluate(`window.__TTE__.settled()`);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
});
