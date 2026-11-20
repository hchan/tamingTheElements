import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';
import { waitForArena } from './support/wait';

// The e2e harness is manually stepped (?manual=1: the tick stays 0 until stepped), so the ROUND 1 / FIGHT! banner never runs out by itself and the card, which never shows over a banner, would wait for the 7 s + 12 s fallbacks. Step past the banner first.
const PAST_BANNER = 'window.__TTE__.arena.step(160)';

// The Tour has no in-fight card (its stage card names the controls); the card is shown in Versus. The first battle shows a short "First blood" card; Got it removes it and the choice is remembered.
// QA r49/r50: a super cut-in removes the card on the spot, so it never sits over the cut-in band.
test('first-run hint is gone the moment a super cut-in starts', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: /^Fight/ }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(PAST_BANNER);
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
    await page.evaluate(PAST_BANNER);
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
  await page.evaluate(PAST_BANNER);
  const card = page.locator('#firstRunHint');
  await expect(card).toBeVisible({ timeout: 15_000 });
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.height ?? 999).toBeLessThan(100);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThan(720 * 0.92);
  await expect(page.locator('#firstRunHint:not(.firstRunFade)')).toHaveCount(0, { timeout: 15_000 }); // faded, or already removed (PHONE-2)
  expect(errors).toEqual([]);
});

// HINT-CUT-1 (QA r92): a super cut that starts before the card is revealed (round 1, the QA step harness, a build with a live meter at the
// reveal) drops the card for this battle: it never sits on the band or the portrait, and it does not appear late.
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

for (const vp of [
  { name: '1280x720', width: 1280, height: 720 },
]) {
  test.describe(`card is dropped for a super band, ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    test('the card never shows over the band or after it', async ({ page }, testInfo) => {
      const errors = collectErrors(page);
      await page.addInitScript(`(() => {
        const real = window.setTimeout.bind(window);
        window.setTimeout = (fn, ms, ...a) => real(fn, ms === 7000 || ms === 2500 ? 600000 : ms, ...a);
      })()`);
      await page.goto(`${START}&ff=arcade#versus`);
      await page.getByLabel('Your race').selectOption('morblass');
      await page.getByLabel('AI race').selectOption('fiara');
      await page.getByRole('button', { name: 'Fight!' }).click();
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
      // QA r92: a super before the reveal means the fight is under way: the card is dropped, never shown over the band.
      await expect(card).toHaveCount(0);
      await shot('band');
      // Once the band is gone the card still does not come back.
      await page.evaluate(`window.__TTE__.arena.step(30)`);
      await expect
        .poll(async () => (await probe(page)).alpha, { message: 'super band alpha fades out after step(30)' })
        .toBeLessThanOrEqual(0.05);
      await expect(card).toHaveCount(0);
      expect((await probe(page)).alpha).toBeLessThanOrEqual(0.05);
      await shot('card-after');
      expect(errors).toEqual([]);
    });
  });
}

// qa-r125 (long gate: visual size check, about 10 s): at 1920x1080 the card text scales up instead of staying 11px.
test('first-run hint text scales up at 1920x1080', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: /^Fight/ }).click();
  await waitForArena(page);
  await page.evaluate(PAST_BANNER);
  const card = page.locator('#firstRunHint');
  await expect(card).toBeVisible({ timeout: 15_000 });
  const px = await page.evaluate<number>(`parseFloat(getComputedStyle(document.getElementById('firstRunHint')).fontSize)`);
  expect(px).toBeGreaterThanOrEqual(15);
  await page.screenshot({ path: '.scratch/first-run-1920.png' });
  expect(errors).toEqual([]);
});
