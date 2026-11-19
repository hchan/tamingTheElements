import { expect, test } from '@playwright/test';
import { START } from './parity/helpers';

// qa-r25: a saved won Tour run reopens the victory screen (title, summary, Play again / Main Menu), not the team picker.
const KEY = 'tte.tour.v1';
const won = '{"v":1,"seed":7,"hero":["curomo","pax","wispera"],"stage":8,"continues":1,"status":"won"}';
const shotDir = process.env['SHOT_DIR'];

for (const vp of [{ width: 1280, height: 720 }]) {
  test(`saved won tour shows the victory screen at ${String(vp.width)}x${String(vp.height)}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto(`${START}&ff=arcade#main`);
    await page.evaluate(`localStorage.setItem('${KEY}', '${won}')`);
    await page.goto(`${START}&ff=arcade#tour`);
    await expect(page.getByRole('heading', { name: 'The tour is complete!' })).toBeVisible();
    await expect(page.locator('#tourEnding')).toContainText('Stages cleared: 9 of 9');
    await expect(page.locator('#tourEnding')).toContainText('Continues used: 2 of 3');
    await expect(page.locator('#tourEnding .tourVictoryTeam li')).toHaveCount(3);
    await expect(page.getByRole('link', { name: 'Main Menu' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Play again' })).toBeInViewport();
    await expect(page.locator('#tourPick')).toHaveCount(0);
    if (shotDir) await page.screenshot({ path: `${shotDir}/tour-win-${String(vp.width)}.png` });
    await page.getByRole('button', { name: 'Play again' }).click();
    await expect(page.locator('#tourPick')).toBeVisible();
    expect(await page.evaluate<string | null>(`localStorage.getItem('${KEY}')`)).toBeNull();
  });
}
