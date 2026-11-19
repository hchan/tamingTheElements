import { expect, test } from '@playwright/test';
import { START } from './parity/helpers';

// QA r110 findings 4 and 5: on a portrait phone the menu label no longer runs into its subtitle ("PlayA tour of nine fights"), and the
// Tour stage card keeps FIGHT inside the first screen (pinned to the bottom edge) instead of below the fold.
for (const [width, height] of [[390, 844], [360, 640]] as const) {
  test.describe(`portrait phone ${String(width)}x${String(height)}`, () => {
    test.use({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    test('menu label sits above its subtitle, not beside it', async ({ page }) => {
      await page.goto(`${START}&ff=arcade`);
      const buttons = page.locator('.mainMenuList li button');
      await expect(buttons).toHaveCount(5);
      for (let i = 0; i < 5; i++) {
        const b = buttons.nth(i);
        await expect(b).toHaveCSS('flex-direction', 'column');
        await expect(b).toHaveCSS('align-items', 'center');
      }
      // Label over subtitle: Play is two stacked lines, so it is taller than a single 44 px row.
      const play = await buttons.first().boundingBox();
      expect(play?.height ?? 0).toBeGreaterThan(44);
    });

    test('Tour stage card keeps FIGHT inside the first screen without scrolling', async ({ page }) => {
      await page.goto(`${START}&ff=arcade#tour`);
      await page.getByRole('button', { name: 'Start tour' }).tap();
      const fight = page.locator('#tourFight');
      await expect(fight).toBeVisible();
      // Wait for the enhanced card (lazy stylesheet) so the card has its full height before measuring.
      await page.locator('#tourStage .tsTeam .tsMine').first().waitFor();
      await page.waitForFunction("getComputedStyle(document.querySelector('#tourStage')).opacity === '1'");
      // The page really is taller than the screen (nine stage tiles), so the pin is what keeps FIGHT in reach.
      const tall = await page.evaluate<boolean>(`document.documentElement.scrollHeight > innerHeight`);
      expect(tall).toBe(true);
      await expect.poll(async () => {
        const b = await fight.boundingBox();
        return b ? b.y + b.height <= height + 0.5 && b.y >= 0 : false;
      }).toBe(true);
      expect(await page.evaluate<number>('scrollY')).toBe(0);
      await expect(fight).toHaveCSS('position', 'sticky');
      expect((await fight.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      // No horizontal overflow widening the mobile viewport (that pushed the pin 5 px off the screen).
      expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(width);
      await fight.click({ trial: true });
    });
  });
}
// Gate label: long gate (untagged): two phone viewports, lazy-CSS wait, not core-path.
