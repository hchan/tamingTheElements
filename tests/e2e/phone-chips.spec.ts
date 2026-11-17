import { expect, test } from '@playwright/test';
import { START } from './parity/helpers';

// QA r91 P3: at 360 and 390 wide the Help jump chips must sit fully inside the viewport (not clipped), and the Versus "More below" tab
// (a ::before on .vsActions, seated above the footer bar) must not overlap the bar itself.
const PHONES: ReadonlyArray<readonly [number, number]> = [[390, 844], [360, 640]];
interface Tab { barTop: number; scrollBottom: number; tabRight: number; tabLeft: number; tabTop: number; tabBottom: number }
/** Geometry of the "More below" tab (a ::before on the bar, absolutely positioned against the bar's padding box). */
const TAB = `(() => {
  const bar = document.querySelector('#arcadePick .vsActions');
  const cs = getComputedStyle(bar, '::before');
  const bs = getComputedStyle(bar);
  const b = bar.getBoundingClientRect();
  const right = parseFloat(cs.right);
  const w = parseFloat(cs.width);
  const tabBottom = b.bottom - parseFloat(bs.borderBottomWidth) - parseFloat(cs.bottom);
  const scrollBottom = bar.previousElementSibling.getBoundingClientRect().bottom;
  return { barTop: b.top, scrollBottom, tabRight: b.right - right, tabLeft: b.right - right - w, tabTop: tabBottom - parseFloat(cs.height), tabBottom };
})()`;
const SHOTS = process.env['CHIP_SHOTS'];
for (const [width, height] of PHONES) {
  test.describe(`Chips on portrait phone ${String(width)}x${String(height)}`, () => {
    test.use({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    test('Help jump chips are not clipped', async ({ page }, info) => {
      await page.goto(`${START}#help`);
      const chips = page.locator('nav.helpJump .helpJumpBtn');
      await expect(chips.first()).toBeVisible();
      await page.screenshot({ path: SHOTS ? `${SHOTS}/help-${String(width)}.png` : info.outputPath('help.png') });
      const n = await chips.count();
      expect(n).toBe(5);
      for (let i = 0; i < n; i++) {
        const b = await chips.nth(i).boundingBox();
        expect(b).not.toBeNull();
        if (!b) continue;
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(width + 0.5);
      }
      const clipped = await page.evaluate<boolean>(`(() => { const nav = document.querySelector('nav.helpJump'); return nav.scrollWidth > nav.clientWidth + 1; })()`);
      expect(clipped).toBe(false);
    });

    test('Versus More-below tab does not overlap the footer bar', async ({ page }, info) => {
      await page.goto(`${START}&ff=arcade#arcade`);
      await expect(page.locator('#arcadePick .heroTile').first()).toBeVisible();
      await expect(page.locator('#arcadePick .pickScroll[data-more]')).toHaveCount(1);
      await page.screenshot({ path: SHOTS ? `${SHOTS}/versus-${String(width)}.png` : info.outputPath('versus.png') });
      const m = await page.evaluate<Tab>(TAB);
      expect(m.tabLeft).toBeGreaterThanOrEqual(0);
      expect(m.tabRight).toBeLessThanOrEqual(width + 0.5);
      expect(m.tabBottom).toBeLessThanOrEqual(m.barTop + 0.5);
      // ... and it sits below the scroll region, so it covers no hero card.
      expect(m.tabTop).toBeGreaterThanOrEqual(m.scrollBottom - 0.5);
    });
  });
}
