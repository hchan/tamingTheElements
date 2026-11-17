import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// SUPER-BAND-PORTRAIT: in portrait play (tall canvas) the super band, its dim and its title use the real view height: the band sits inside
// the canvas, under the HUD band (where the SAFE chip lives) and above the action bar, on every tick of the cut. Shots go to $SHOT_DIR.
const shotDir = process.env['SHOT_DIR'];
const ATTR = `document.documentElement.hasAttribute('data-portrait-play')`;
const STRIP = 52;
const HUD_BAND = 70;
const SUPER = 1 << 13;
const INTRO = 91;

interface Box { x: number; y: number; w: number; h: number }
interface Fx {
  zoom: number;
  nameAlpha: number;
  bandAlpha: number;
  band: { y: number; k: number; ext: number; window: { top: number; bottom: number }; viewHeight: number };
}
const box = (page: Page, sel: string): Promise<Box> =>
  page.evaluate<Box>(`(() => {
    const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const superFx = (page: Page): Promise<Fx | undefined> => page.evaluate<Fx | undefined>(`window.__TTE__.arena.superFx()`);

for (const [w, h] of [[390, 844], [360, 640]] as const) {
  test.describe(`portrait super band ${String(w)}x${String(h)}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    test('the band sits inside the canvas, under the HUD band and above the action bar on every tick', async ({ page }) => {
      test.setTimeout(120_000);
      const errors = collectErrors(page);
      await page.goto(`${START}&ff=arcade#arcade`);
      await page.getByRole('button', { name: /^Fight/ }).tap();
      await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
      await page.getByRole('button', { name: 'Play anyway in portrait' }).tap();
      await page.waitForFunction(ATTR);
      await expect.poll(async () => (await box(page, '#arcadeDash')).h, { message: 'one-row layout settles' }).toBeGreaterThan(70);
      await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
      await frames(page);
      if (shotDir) await page.screenshot({ path: `${shotDir}/before-${String(w)}.png` });
      await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setMeter(0, 1000); a.step(1, [${String(SUPER)}, 0]); })()`);
      await expect.poll(async () => (await superFx(page)) !== undefined).toBe(true);
      let shots = 0;
      for (let i = 0; i < 40; i++) {
        await frames(page);
        const fx = await superFx(page);
        if (!fx) break;
        const canvas = await box(page, '#game canvas');
        const bar = await box(page, '#arcadeDash');
        const k = canvas.h / fx.band.viewHeight;
        const top = canvas.y + (fx.band.y - fx.band.ext) * k;
        const bottom = canvas.y + (fx.band.y + fx.band.ext) * k;
        expect(fx.band.viewHeight, 'tall view').toBeGreaterThan(720);
        expect(top, 'band inside the canvas').toBeGreaterThanOrEqual(canvas.y);
        expect(bottom, 'band inside the canvas').toBeLessThanOrEqual(canvas.y + canvas.h);
        expect(top, `band under the HUD band (${String(top)})`).toBeGreaterThanOrEqual(STRIP + HUD_BAND - 0.5);
        expect(bottom, `band above the action bar (${String(bottom)} vs ${String(bar.y)})`).toBeLessThanOrEqual(bar.y + 0.5);
        if (shots === 0 && fx.nameAlpha === 1 && fx.zoom >= 1.1 && shotDir) {
          shots++;
          await page.screenshot({ path: `${shotDir}/super-portrait-${String(w)}.png` });
        }
        await page.evaluate(`window.__TTE__.arena.step(1)`);
      }
      expect(errors).toEqual([]);
    });
  });
}
