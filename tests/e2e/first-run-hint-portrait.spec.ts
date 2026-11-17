import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// QA r91 P2: on a portrait phone the first-fight card must never sit on the super band, so the first super cut-in is readable.
const SUPER = 1 << 13;
const shotDir = process.env['SHOT_DIR'];
interface Rect { y0: number; y1: number }
interface Probe { alpha: number; band: Rect | null; card: Rect | null; cls: string }
const probe = (page: Page): Promise<Probe> =>
  page.evaluate<Probe>(`(async () => {
    const fx = await window.__TTE__.arena.superFx();
    const c = document.querySelector('#game canvas').getBoundingClientRect();
    const k = fx && fx.band ? c.height / fx.band.viewHeight : 1;
    const card = document.getElementById('firstRunHint');
    const cr = card ? card.getBoundingClientRect() : null;
    return {
      alpha: fx ? fx.bandAlpha : 0,
      band: fx && fx.band ? { y0: c.top + (fx.band.y - fx.band.ext) * k, y1: c.top + (fx.band.y + fx.band.ext) * k } : null,
      card: cr ? { y0: cr.top, y1: cr.bottom } : null,
      cls: card ? card.className : '',
    };
  })()`);
const meets = (a: Rect | null, b: Rect | null): boolean => !!a && !!b && a.y0 < b.y1 && b.y0 < a.y1;

for (const [w, h] of [[390, 844], [360, 640]] as const) {
  test.describe(`card clear of the super band, portrait ${String(w)}x${String(h)}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    for (const early of [false, true]) test(`the card never overlaps the band${early ? ' (super before the reveal)' : ''}`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors = collectErrors(page);
      if (early) {
        await page.addInitScript(`(() => {
          const real = window.setTimeout.bind(window);
          window.setTimeout = (fn, ms, ...a) => real(fn, ms === 7000 || ms === 2500 ? 600000 : ms, ...a);
        })()`);
      }
      await page.goto(`${START}&ff=arcade#versus`);
      await page.getByLabel('Your race').selectOption('morblass');
      await page.getByLabel('AI race').selectOption('fiara');
      await page.getByRole('button', { name: 'Fight!' }).tap();
      await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
      await page.getByRole('button', { name: 'Play anyway in portrait' }).tap();
      await page.waitForFunction(`document.documentElement.hasAttribute('data-portrait-play')`);
      const card = page.locator('#firstRunHint');
      if (early) {
        // The super starts right as FIGHT! clears, before the card is revealed.
        await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(95); a.setMeter(0, 1000); a.step(2); a.step(1, [${String(SUPER)}, 0]); a.step(5); })()`);
      } else {
        // The card never shows over a banner: while FIGHT! is still up (tick 95) it stays hidden, then appears once the banner has run out.
        await page.evaluate(`window.__TTE__.arena.step(95)`);
        expect((await page.evaluate<{ main: string }>(`window.__TTE__.arena.rounds()`)).main).toBe('FIGHT!');
        await page.waitForTimeout(600);
        await expect(card).toBeHidden();
        await page.evaluate(`window.__TTE__.arena.step(60)`);
        await expect(card).toBeVisible({ timeout: 15_000 });
        if (shotDir) await page.screenshot({ path: `${shotDir}/card-${String(w)}.png` });
        await page.keyboard.press('x');
        await expect(card).toHaveClass(/firstRunFade/);
        await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setMeter(0, 1000); a.step(1, [${String(SUPER)}, 0]); a.step(5); })()`);
      }
      await expect.poll(async () => (await probe(page)).alpha).toBeGreaterThan(0.05);
      // The tap on Super is itself a first input: it starts the card's fade, which must still yield to the cut at once (checked on every tick, no waiting).
      for (let i = 0; i < 25; i++) {
        const s = await probe(page);
        expect(meets(s.card, s.band), `card ${JSON.stringify(s.card)} band ${JSON.stringify(s.band)}`).toBe(false);
        if (i === 8 && shotDir) await page.screenshot({ path: `${shotDir}/super-${early ? 'early-' : ''}${String(w)}.png` });
        await page.evaluate(`window.__TTE__.arena.step(1)`);
      }
      // QA r92: the card never comes back after a super (early: it was never shown; late: it was seen and is gone).
      await page.evaluate(`window.__TTE__.arena.step(150)`);
      await page.waitForTimeout(400);
      await expect(card).toHaveCount(0);
      if (shotDir) await page.screenshot({ path: `${shotDir}/after-super-${early ? 'early-' : ''}${String(w)}.png` });
      expect(errors).toEqual([]);
    });
  });
}
