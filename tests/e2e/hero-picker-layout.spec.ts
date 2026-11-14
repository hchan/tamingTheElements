import { expect, test } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';

// The Play hero picker: the Start bar must never hide the last roster row (Earth). Scrolled to the end, every tile ends above the bar.
for (const vp of [
  { w: 1920, h: 1080 },
  { w: 1280, h: 720 },
  { w: 1024, h: 768 },
  { w: 800, h: 600 },
  { w: 667, h: 375 },
  { w: 390, h: 844 },
]) {
  test(`Play picker ${String(vp.w)}x${String(vp.h)}: Earth row clears the Start bar, no horizontal overflow`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto(`${START}&ff=arcade#tour`);
    await page.locator('.heroTile').first().waitFor();
    // Scroll everything that scrolls (the page box, or the document on phone landscape) to its end.
    await page.evaluate(`document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight; }); document.scrollingElement.scrollTop = 1e6;`);
    const m = await page.evaluate<{ tileBottom: number; barTop: number; barBottom: number; sw: number; iw: number; sh: number; ih: number }>(
      `(() => { const t = [...document.querySelectorAll('.heroTile')].pop().getBoundingClientRect(); const b = document.querySelector('.heroActions').getBoundingClientRect(); const d = document.documentElement; return { tileBottom: t.bottom, barTop: b.top, barBottom: b.bottom, sw: d.scrollWidth, iw: innerWidth, sh: d.scrollHeight, ih: innerHeight }; })()`,
    );
    expect(m.tileBottom).toBeLessThanOrEqual(m.barTop + 0.5);
    expect(m.barBottom).toBeLessThanOrEqual(m.ih + 0.5);
    expect(m.sw).toBeLessThanOrEqual(m.iw);
    await expect(page.locator('#tourStart')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
