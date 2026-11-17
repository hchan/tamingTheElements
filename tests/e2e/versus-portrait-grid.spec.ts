import { expect, test } from '@playwright/test';
import { START } from './parity/helpers';

// QA r83 P6: on a portrait phone the Versus picker stacked four option rows and two fighter cards above the hero grid, so the first hero card
// sat behind a long scroll. The first hero card must be inside the first viewport, clear of the Fight bar, with a touch target of at least 44 px.
const PHONES: ReadonlyArray<readonly [number, number]> = [[390, 844], [360, 640]];
for (const [width, height] of PHONES) {
  test.describe(`Versus hero grid on portrait phone ${String(width)}x${String(height)}`, () => {
    test.use({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    test('first hero card is in the first viewport without scrolling', async ({ page }, info) => {
      await page.goto(`${START}&ff=arcade#arcade`);
      const tile = page.locator('#arcadePick .heroTile').first();
      await expect(tile).toBeVisible();
      const shots = process.env['VS_SHOTS'];
      await page.screenshot({ path: shots ? `${shots}/portrait-${String(width)}x${String(height)}.png` : info.outputPath('portrait.png') });
      const t = await tile.boundingBox();
      const bar = await page.locator('#arcadePick .vsActions').boundingBox();
      expect(t).not.toBeNull();
      expect(bar).not.toBeNull();
      if (!t || !bar) return;
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y + t.height).toBeLessThanOrEqual(bar.y + 0.5);
      expect(t.width).toBeGreaterThanOrEqual(44);
      expect(t.height).toBeGreaterThanOrEqual(44);
      expect(t.x + t.width).toBeLessThanOrEqual(width + 0.5);
    });
  });
}
