import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START } from './parity/helpers';

// QA r70 phone layout: on a phone the arena canvas is never covered by a touch button (Strike 1/2, Pause), and in portrait ("Play anyway")
// it fills the screen width (a 16:9 fit, so 390 CSS px wide is the most height the fit can give). Shots go to $SHOT_DIR when set.
const shotDir = process.env['SHOT_DIR'];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const box = (page: Page, sel: string): Promise<Box> =>
  page.evaluate<Box>(`(() => {
    const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
// 0.5 px tolerance: the Strikes touch the canvas edge (0 px gap) and layout is subpixel.
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

async function fight(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: /^Fight/ }).tap();
  await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
  await page.locator('#touchStrikes').waitFor();
  // Both fighters near the right wall: the worst place for the foe to stand under a right-edge button.
  await page.evaluate(`(() => {
    const a = window.__TTE__.arena;
    a.step(91);
    const [me, foe] = a.characters();
    a.place(me.id, 1100, 420, 4);
    a.place(foe.id, 1230, 380, 4);
    a.step(60);
  })()`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
}

for (const [w, h] of [[844, 390], [667, 375], [640, 360]] as const) {
  test.describe(`phone landscape ${String(w)}x${String(h)}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    test('no touch button or Pause covers the arena canvas, so the foe at the wall is never hidden', async ({ page }) => {
      await fight(page);
      await page.screenshot({ path: shotDir ? `${shotDir}/land-${String(w)}-wall.png` : test.info().outputPath(`land-${String(w)}-wall.png`) });
      const canvas = await box(page, '#game canvas');
      expect(canvas.h).toBeGreaterThanOrEqual(h * 0.8); // still a big arena
      for (const id of ['#touchStrike1', '#touchStrike2', '#pauseButton']) {
        const b = await box(page, id);
        expect(overlap(canvas, b), `${id} ${JSON.stringify(b)} vs canvas ${JSON.stringify(canvas)}`).toBe(false);
        expect(b.x + b.w, id).toBeLessThanOrEqual(w);
      }
      for (const id of ['#touchStrike1', '#touchStrike2']) {
        const b = await box(page, id);
        expect(b.w, id).toBeGreaterThanOrEqual(44);
        expect(b.h, id).toBeGreaterThanOrEqual(44);
      }
      if (w < 740) {
        const toggle = await box(page, '#fullscreenToggle');
        expect(overlap(canvas, toggle), `toggle ${JSON.stringify(toggle)}`).toBe(false);
        for (const id of ['#pauseButton', '#touchStrike1', '#touchStrike2']) expect(overlap(toggle, await box(page, id)), `toggle vs ${id}`).toBe(false);
        expect(toggle.x).toBeGreaterThanOrEqual(0);
        expect(toggle.x + toggle.w).toBeLessThanOrEqual(w);
        expect(toggle.y + toggle.h).toBeLessThanOrEqual(h);
      }
    });
  });
}

// PHONE-2: the first-run card fades 125 fight ticks (2.5 s of fight time) after the FIGHT! banner ends, then leaves the DOM.
test.describe('phone 667x375 first-run card', () => {
  test.use({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('the first-run card fades 2.5 s of fight time after FIGHT! and leaves the DOM', async ({ page }, info) => {
    // The wall-clock 2.5 s timer is stretched, so only the tick-based settle event can dismiss the card here.
    await page.addInitScript(`(() => { const real = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...a) => real(fn, ms === 2500 ? 600000 : ms, ...a);
      window.addEventListener('tte:fight-over', () => { window.__foTick = window.__TTE__.arena.tick; }); })()`);
    const raf = (): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const shot = (name: string): Promise<Buffer> => page.screenshot({ path: shotDir ? `${shotDir}/${name}` : info.outputPath(name) });
    await fight(page);
    await expect(page.locator('#firstRunHint:not(.firstRunWait)')).toHaveCount(1);
    await shot('hint-on-667.png');
    const fo = await page.evaluate<number>(`window.__foTick`);
    expect(fo).toBeGreaterThan(0);
    const now = await page.evaluate<number>(`window.__TTE__.arena.tick`);
    await page.evaluate(`window.__TTE__.arena.step(${String(Math.max(0, fo + 120 - now))})`);
    await raf();
    await expect(page.locator('#firstRunHint.firstRunFade')).toHaveCount(0);
    await page.evaluate(`window.__TTE__.arena.step(10)`);
    await raf();
    await expect(page.locator('#firstRunHint')).toHaveCount(0, { timeout: 5_000 });
    expect(await page.evaluate(`localStorage.getItem('tte.firstRunHint')`)).toBe('1');
    await shot('hint-off-667.png');
  });
});

test.describe('phone portrait, Play anyway', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // QA r78: the control is a real button whose accessible name contains its visible text "Play anyway" (label in name).
  test('the rotate prompt exposes Play anyway as a keyboard-reachable button', async ({ page }) => {
    await fight(page);
    if (shotDir) await page.screenshot({ path: `${shotDir}/port-prompt.png` });
    const btn = page.getByRole('button', { name: 'Play anyway' });
    await expect(btn).toHaveCount(1);
    expect(await page.evaluate(`document.getElementById('rotateDismiss').tagName`)).toBe('BUTTON');
    await btn.focus();
    await expect(btn).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#rotateOverlay')).toBeHidden();
  });
  test('the arena canvas fills the screen width and no touch button covers it', async ({ page }) => {
    await fight(page);
    await page.getByRole('button', { name: 'Play anyway in portrait' }).tap();
    if (shotDir) await page.screenshot({ path: `${shotDir}/port-play.png` });
    const canvas = await box(page, '#game canvas');
    expect(canvas.w).toBeGreaterThanOrEqual(388);
    expect(canvas.h).toBeGreaterThanOrEqual(215); // 16:9 of 390
    for (const id of ['#touchStrike1', '#touchStrike2', '#pauseButton']) expect(overlap(canvas, await box(page, id)), id).toBe(false);
  });
});
