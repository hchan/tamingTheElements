import { expect, test } from '@playwright/test';
import { START } from './parity/helpers';

// Versus picker layout: every option row fits the viewport width, and the Fight bar is small enough that the hero list stays usable.
const SIZES: ReadonlyArray<readonly [string, number, number]> = [['desktop', 1280, 720], ['phone-landscape', 844, 390], ['phone-portrait', 390, 844]];

for (const [name, width, height] of SIZES) {
  test(`Versus picker fits ${name} ${String(width)}x${String(height)}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByRole('radio', { name: /^✓?3v3 tag team$/ }).click();
    const fight = page.getByRole('button', { name: 'Fight!' });
    await expect(fight).toBeVisible();
    const shots = process.env['VS_SHOTS'];
    await page.screenshot({ path: shots ? `${shots}/${name}.png` : info.outputPath(`${name}.png`) });
    const over: string[] = [];
    for (const seg of await page.locator('#arcadePick .vsControl:visible .vsSegment').all()) {
      const box = await seg.boundingBox();
      if (!box || box.x < -0.5 || box.x + box.width > width + 0.5) over.push((await seg.textContent()) ?? '');
    }
    expect(over).toEqual([]);
    // The sticky bar leaves most of the viewport to the picker, and Fight is on screen.
    const bar = await page.locator('#arcadePick .vsActions').boundingBox();
    // Short landscape screens let the bar scroll with the page; Fight must still be reachable by scrolling.
    await fight.scrollIntoViewIfNeeded();
    const fb = await fight.boundingBox();
    expect(bar).not.toBeNull();
    expect(bar ? bar.height : 0).toBeLessThanOrEqual(height * 0.2);
    expect(fb ? fb.y + fb.height : 0).toBeLessThanOrEqual(height);
    expect(fb ? fb.x + fb.width : 0).toBeLessThanOrEqual(width);
  });
}
