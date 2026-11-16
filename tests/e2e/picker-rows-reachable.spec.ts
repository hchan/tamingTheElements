import { expect, test } from '@playwright/test';
import { START } from './parity/helpers';

// QA r73: every element row (Water, Air, Fire, Earth) of the Play and Versus hero pickers is either fully inside the scroll region
// or reachable by scrolling it. Page-side code is passed as strings (no DOM lib in tsconfig.node).
for (const vp of [
  { w: 1280, h: 720, touch: false },
  { w: 844, h: 390, touch: true },
]) {
  for (const hash of ['tour', 'arcade']) {
    test.describe(`${hash} picker ${String(vp.w)}x${String(vp.h)}`, () => {
      test.use({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.touch, hasTouch: vp.touch });

      test('every element row is fully visible or reachable by scrolling the region', async ({ page }) => {
        await page.goto(`${START}&ff=arcade#${hash}`);
        await page.locator('.heroTile').first().waitFor();
        const overflowY = await page.evaluate(`getComputedStyle(document.querySelector('.pickScroll')).overflowY`);
        expect(overflowY).toMatch(/auto|scroll/);
        const rows = await page.evaluate<string[]>(
          `[...new Set([...document.querySelectorAll('.heroTile')].filter((e) => e.offsetParent).map((e) => e.dataset.element))]`,
        );
        expect(rows.length).toBeGreaterThanOrEqual(4);
        for (const el of rows) {
          const fits = (): Promise<boolean> =>
            page.evaluate<boolean>(
              `(() => { const r = document.querySelector('.pickScroll').getBoundingClientRect(); return [...document.querySelectorAll('.heroTile[data-element="${el}"]')].filter((e) => e.offsetParent).every((e) => { const b = e.getBoundingClientRect(); return b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5; }); })()`,
            );
          let ok = await fits();
          for (let i = 0; i < 12 && !ok; i++) {
            await page.evaluate(`document.querySelector('.pickScroll').scrollBy(0, 80)`);
            ok = await fits();
          }
          expect(ok, `${el} row never fully visible`).toBe(true);
        }
      });
    });
  }
}
