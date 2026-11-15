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

// QA r39: on a touch phone in landscape the 2v2 picker keeps its "N of 2 picked" line clear of the sticky Fight bar and never breaks a hero name mid-word.
const PHONES: ReadonlyArray<readonly [number, number]> = [[667, 375], [844, 390]];
for (const [width, height] of PHONES) {
  test.describe(`2v2 picker on touch landscape ${String(width)}x${String(height)}`, () => {
    test.use({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    test('status line is visible above the Fight bar and hero names do not wrap mid-word', async ({ page }, info) => {
      await page.goto(`${START}&ff=arcade#arcade`);
      await page.getByLabel('Team').selectOption('2');
      await page.getByLabel('Your race').selectOption('sindarosa');
      const fight = page.getByRole('button', { name: /^Fight/ });
      await expect(fight).toBeVisible();
      const status = page.locator('#arcadePick .vsStatus:visible').first();
      await expect(status).toContainText('of 2 picked');
      const shots = process.env['VS_SHOTS'];
      const tag = `${String(width)}x${String(height)}`;
      await page.screenshot({ path: shots ? `${shots}/picker-2v2-${tag}-top.png` : info.outputPath('picker-top.png') });
      await status.scrollIntoViewIfNeeded();
      await page.screenshot({ path: shots ? `${shots}/picker-2v2-${tag}.png` : info.outputPath('picker-2v2.png') });
      const sb = await status.boundingBox();
      const bar = await page.locator('#arcadePick .vsActions').boundingBox();
      expect(sb).not.toBeNull();
      expect(bar).not.toBeNull();
      if (sb && bar) {
        expect(sb.y).toBeGreaterThanOrEqual(0);
        expect(sb.y + sb.height).toBeLessThanOrEqual(bar.y + 0.5);
      }
      // A name never breaks inside a word: it is one line (ellipsised when too long) inside its card.
      const bad = await page.evaluate<string[]>(`(() => {
        const out = [];
        for (const n of document.querySelectorAll('#arcadePick .vsSide .vsSlotName')) {
          const cs = getComputedStyle(n);
          const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
          if (n.getBoundingClientRect().height > lh * 1.5) out.push((n.textContent || '') + ' wraps');
          if (n.scrollWidth > n.clientWidth + 1 && cs.textOverflow !== 'ellipsis') out.push((n.textContent || '') + ' clipped');
        }
        return out;
      })()`);
      expect(bad).toEqual([]);
    });
  });
}
