import { expect, test } from '@playwright/test';
import { START } from './parity/helpers';

// QA r80/r81: on a 1280x720 desktop the Versus option rows took about half the height, so the hero grid sat half behind the Fight bar and the
// roster needed an awkward scroll. The whole first hero row must be on screen with the Fight button, with no scrolling.
const SIZES: ReadonlyArray<readonly [number, number]> = [[1280, 720], [1366, 768]];
for (const [width, height] of SIZES) {
  test(`Versus hero grid and Fight are both visible at ${String(width)}x${String(height)}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto(`${START}&ff=arcade#arcade`);
    const tiles = page.locator('#arcadePick .heroGrid .heroTile');
    const fight = page.getByRole('button', { name: 'Fight!' });
    await expect(tiles.first()).toBeVisible();
    await expect(fight).toBeVisible();
    const shots = process.env['VS_SHOTS'];
    await page.screenshot({ path: shots ? `${shots}/desktop-${String(width)}x${String(height)}.png` : info.outputPath('desktop.png') });
    const bar = await page.locator('#arcadePick .vsActions').boundingBox();
    const fb = await fight.boundingBox();
    const first = await tiles.first().boundingBox();
    expect(bar && fb && first).toBeTruthy();
    if (!bar || !fb || !first) return;
    expect(fb.y).toBeGreaterThanOrEqual(0);
    expect(fb.y + fb.height).toBeLessThanOrEqual(height);
    // The roster is not scrolled, a full first row (3 tiles) shares the top line, and every tile (Earth row included) is fully above the bar.
    const boxes = (await Promise.all((await tiles.all()).map((t) => t.boundingBox()))).filter((b) => b !== null);
    expect(boxes.length).toBeGreaterThanOrEqual(12);
    expect(boxes.filter((b) => Math.abs(b.y - first.y) < 4).length).toBeGreaterThanOrEqual(3);
    expect(first.y).toBeGreaterThanOrEqual(0);
    expect(Math.max(...boxes.map((b) => b.y + b.height))).toBeLessThanOrEqual(bar.y + 0.5);
    const scrolled = await page.evaluate<number>(`document.querySelector('#arcadePick .pickScroll').scrollTop`);
    expect(scrolled).toBe(0);
  });
}
