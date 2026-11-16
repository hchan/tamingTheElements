import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// The Tour has no in-fight card (its stage card names the controls); the card is shown in Versus. The first battle shows a short "First blood" card; Got it removes it and the choice is remembered.
// QA r49/r50: a super cut-in removes the card on the spot, so it never sits over the cut-in band.
test('first-run hint is gone the moment a super cut-in starts', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: /^Fight/ }).click();
  await page.waitForFunction(ARENA_READY);
  const card = page.locator('#firstRunHint');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await page.evaluate(`window.dispatchEvent(new Event('tte:super-cut'))`);
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('first-run hint shows, dismisses and is remembered', async ({ page }) => {
  const errors = collectErrors(page);
  const fight = async (): Promise<void> => {
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByRole('button', { name: /^Fight/ }).click();
    await page.waitForFunction(ARENA_READY);
  };
  await fight();
  const card = page.locator('#firstRunHint');
  await expect(card).toBeVisible({ timeout: 15_000 });
  expect(await card.innerText()).not.toMatch(/classic|arcade|ruleset|capture/i);
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(`localStorage.getItem('tte.firstRunHint')`)).toBe('1');
  expect(errors).toEqual([]);
});

// QA r18: at 720p the card is a slim strip clear of the action bar, and it fades by itself soon.
test('first-run hint at 1280x720 is a slim strip above the bar and fades on its own', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: /^Fight/ }).click();
  await page.waitForFunction(ARENA_READY);
  const card = page.locator('#firstRunHint');
  await expect(card).toBeVisible({ timeout: 15_000 });
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.height ?? 999).toBeLessThan(100);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThan(720 * 0.92);
  await expect(page.locator('#firstRunHint:not(.firstRunFade)')).toHaveCount(0, { timeout: 15_000 }); // faded, or already removed (PHONE-2)
  expect(errors).toEqual([]);
});

// QA r43: on a 667x375 phone the card sits in the top band, clear of the lower-left fighting area and the thumb pads.
test.describe('phone', () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
  test('first-run hint at 667x375 stays out of the lower fighting area', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByRole('button', { name: /^Fight/ }).tap();
    await page.waitForFunction(ARENA_READY);
    const card = page.locator('#firstRunHint');
    await expect(card).toBeVisible({ timeout: 15_000 });
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 999) + (box?.height ?? 999)).toBeLessThan(375 * 0.5);
    expect(errors).toEqual([]);
  });
});

// HINT-CUT-1: a super cut that starts before the card is revealed (round 1, the QA step harness, a build with a live meter at the
// reveal) keeps the card waiting: it never sits on the band or the portrait, and it appears once the band is gone.
// Timers of exactly 7000 and 2500 ms are stretched so the intro fallback and the card's fade cannot fire on a slow SwiftShader run.
const SUPER = 1 << 13;
const shotDir = process.env['SHOT_DIR'];
interface CssRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface BandProbe {
  alpha: number;
  band: CssRect | null;
  portrait: CssRect | null;
  card: CssRect | null;
  cls: string;
}
const probe = (page: Page): Promise<BandProbe> =>
  page.evaluate<BandProbe>(`(async () => {
    const fx = await window.__TTE__.arena.superFx();
    const c = document.querySelector('#game canvas').getBoundingClientRect();
    const k = Math.min(c.width / 1280, c.height / 720);
    const left = c.left + (c.width - 1280 * k) / 2;
    const css = (r) => ({ x0: left + r.x0 * k, y0: c.top + r.y0 * k, x1: left + r.x1 * k, y1: c.top + r.y1 * k });
    const card = document.getElementById('firstRunHint');
    const cr = card ? card.getBoundingClientRect() : null;
    return {
      alpha: fx ? fx.bandAlpha : 0,
      band: fx && fx.band ? { x0: c.left, y0: c.top + (fx.band.y - fx.band.ext) * k, x1: c.right, y1: c.top + (fx.band.y + fx.band.ext) * k } : null,
      portrait: fx && fx.band && fx.band.portrait ? css(fx.band.portrait) : null,
      card: cr ? { x0: cr.left, y0: cr.top, x1: cr.right, y1: cr.bottom } : null,
      cls: card ? card.className : '',
    };
  })()`);
const meets = (a: CssRect | null, b: CssRect | null): boolean => !!a && !!b && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

for (const vp of [
  { name: '1280x720', width: 1280, height: 720, touch: false },
  { name: '844x390', width: 844, height: 390, touch: true },
  { name: '667x375', width: 667, height: 375, touch: true },
]) {
  test.describe(`card waits for a live super band, ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });
    test('the card stays hidden during the band and appears after it', async ({ page }, testInfo) => {
      const errors = collectErrors(page);
      await page.addInitScript(`(() => {
        const real = window.setTimeout.bind(window);
        window.setTimeout = (fn, ms, ...a) => real(fn, ms === 7000 || ms === 2500 ? 600000 : ms, ...a);
      })()`);
      await page.goto(`${START}&ff=arcade#versus`);
      await page.getByLabel('Your race').selectOption('morblass');
      await page.getByLabel('AI race').selectOption('fiara');
      const fight = page.getByRole('button', { name: 'Fight!' });
      if (vp.touch) await fight.tap();
      else await fight.click();
      await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
      const shot = async (label: string): Promise<void> => {
        await page.screenshot({ path: testInfo.outputPath(`${vp.name}-${label}.png`) });
        if (shotDir) await page.screenshot({ path: `${shotDir}/hint-cut-${vp.name}-${label}.png` });
      };
      // t103: FIGHT! has just cleared (the card's reveal) and the super is already on screen.
      await page.evaluate(`(() => {
        const a = window.__TTE__.arena;
        a.step(95);
        const [me, foe] = a.characters();
        a.place(me.id, 560, 360, 0);
        a.place(foe.id, 680, 360, 4);
        a.setMeter(0, 1000);
        a.step(2);
        a.step(1, [${String(SUPER)}, 0]);
        a.step(5);
      })()`);
      const card = page.locator('#firstRunHint');
      await expect.poll(async () => (await probe(page)).alpha).toBeGreaterThan(0.05);
      let s = await probe(page);
      expect(s.cls).toContain('firstRunWait');
      expect(meets(s.card, s.band)).toBe(false);
      await shot('band');
      await page.evaluate(`window.__TTE__.arena.step(10)`);
      s = await probe(page);
      expect(s.cls).toContain('firstRunWait');
      // The band is gone: the gate polls every 100 ms and then reveals the card.
      await page.evaluate(`window.__TTE__.arena.step(20)`);
      await expect(card).not.toHaveClass(/firstRunWait/);
      await expect(card).toBeVisible();
      s = await probe(page);
      expect(s.alpha).toBeLessThanOrEqual(0.05);
      await shot('card-after');
      expect(errors).toEqual([]);
    });
  });
}
