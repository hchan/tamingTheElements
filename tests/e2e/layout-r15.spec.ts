import { expect, test } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';

// QA r15 layout fixes: the Tour stage strip stays inside the screen with its words whole, and at 720p the Play hero panel
// (stats and abilities) ends above the Start bar. Page-side code is passed as strings (no DOM lib in tsconfig.node).
for (const vp of [
  { w: 1280, h: 720 },
  { w: 844, h: 390 },
  { w: 390, h: 844 },
]) {
  test(`Tour stage ${String(vp.w)}x${String(vp.h)}: the nine stage tiles fit the screen and their words are not cut`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto(`${START}&ff=arcade#tour`);
    await page.getByLabel('Hero 1 (lead)').selectOption('fiara');
    await page.getByLabel('Hero 2').selectOption('rokcore');
    await page.getByLabel('Hero 3').selectOption('curomo');
    await page.getByRole('button', { name: 'Start tour' }).click();
    await page.locator('#tourPins li').first().waitFor();
    const m = await page.evaluate<{ over: string[]; cut: string[]; sw: number; iw: number; tiles: number }>(
      `(() => { const iw = innerWidth; const lis = [...document.querySelectorAll('#tourPins li')];
        const over = lis.filter((l) => { const r = l.getBoundingClientRect(); return r.left < -0.5 || r.right > iw + 0.5; }).map((l) => l.textContent);
        const cut = lis.filter((l) => { const t = l.firstElementChild; return t && (t.scrollWidth > t.clientWidth + 1 || t.getBoundingClientRect().right > l.getBoundingClientRect().right + 1); }).map((l) => l.textContent);
        return { over, cut, sw: document.documentElement.scrollWidth, iw, tiles: lis.length }; })()`,
    );
    expect(m.tiles).toBe(9);
    expect(m.over).toEqual([]);
    expect(m.cut).toEqual([]);
    expect(m.sw).toBeLessThanOrEqual(m.iw);
    expect(errors).toEqual([]);
  });
}

test('Tour stage 844x390 on a touch phone: stage tiles do not overlap (the Cleared stamp stays visible)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${START}&ff=arcade#tour`);
  await page.getByLabel('Hero 1 (lead)').selectOption('fiara');
  await page.getByLabel('Hero 2').selectOption('rokcore');
  await page.getByLabel('Hero 3').selectOption('curomo');
  await page.getByRole('button', { name: 'Start tour' }).click();
  await page.locator('#tourPins li').first().waitFor();
  const overlaps = await page.evaluate<number>(
    `(() => { const r = [...document.querySelectorAll('#tourPins li')].map((l) => l.getBoundingClientRect()); let n = 0;
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i], b = r[j];
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) n++; }
      return n; })()`,
  );
  expect(overlaps).toBe(0);
  await ctx.close();
});

test('Play hero select 1280x720: the stat panel (Life, Speed, Alignment, Abilities) ends above the Start bar', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${START}&ff=arcade#tour`);
  await page.locator('.heroTile').first().waitFor();
  await page.locator('.heroTile').first().hover();
  await page.locator('.heroAbility').first().waitFor();
  const m = await page.evaluate<{ panelBottom: number; barTop: number; abilities: number }>(
    `(() => ({ panelBottom: document.querySelector('.heroPanel').getBoundingClientRect().bottom, barTop: document.querySelector('.heroActions').getBoundingClientRect().top, abilities: document.querySelectorAll('.heroAbility').length }))()`,
  );
  expect(m.abilities).toBeGreaterThan(0);
  expect(m.panelBottom).toBeLessThanOrEqual(m.barTop + 0.5);
  expect(errors).toEqual([]);
});
