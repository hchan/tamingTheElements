// Real-game stills: roster24 victory stills and the freeze/daze status-ring plates (plus the procedural fallback with the plate
// requests aborted). Long gate, not @smoke (real fights, about 20 s each; not part of `pnpm e2e`). Run `pnpm visual:stills`;
// output in STILLS_OUT (default test-results/visual/stills/). Setups copied from tests/e2e/victory-still.spec.ts and status-ring.spec.ts.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from '../e2e/parity/helpers';
import { waitFor, waitForArena } from '../e2e/support/wait';

const OUT = process.env['STILLS_OUT'] ?? join(process.cwd(), 'test-results', 'visual', 'stills');
const SUPER = 1 << 13;
const ROUND = 90 + 30 + 120 + 60 + 71;
// Quake supers (umbrel, durrok, quarrak) are rings out to 480 px, so those heroes start close.
const CLOSE = new Set(['umbrel', 'durrok', 'quarrak']);

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const ev = (page: Page, code: string): Promise<unknown> => page.evaluate(code);

test.beforeAll(() => { mkdirSync(OUT, { recursive: true }); });

for (const hero of ['glimmaw', 'kindrel', 'umbrel', 'durrok', 'quarrak']) {
  test(`${hero} victory still on the results screen`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade,roster24#arcade`);
    await page.getByLabel('Your race').selectOption(hero);
    await page.getByLabel('AI race').selectOption('fiara');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await waitFor(page, 'arena ready', ARENA_READY);
    await ev(page, `window.__TTE__.arena.step(91)`);
    for (let round = 0; round < 2; round++) {
      await ev(page, `(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 300, 360, 0); a.place(f.id, ${CLOSE.has(hero) ? '540' : '900'}, 360, 4); a.setMeter(0, 1000); a.setHp(f.id, 1); a.step(1, [${String(SUPER)}, 0]); a.step(${String(ROUND)}); })()`);
    }
    await waitFor(page, 'results screen', `!!document.querySelector('#arcadeResults')`);
    await expect(page.locator('#arcadeResults .matchEndStill')).toHaveAttribute('data-hero', hero);
    await page.screenshot({ path: join(OUT, `${hero}-victory.png`), animations: 'disabled', caret: 'hide' });
    expect(errors).toEqual([]);
  });
}

/** Fiara (left) vs Rokcore, freeze (5) and daze (10) on the left hero; saves a feet crop named `name`. */
async function ringShot(page: Page, name: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('fiara');
  await page.getByLabel('AI race').selectOption('rokcore');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await waitForArena(page);
  const card = page.getByRole('button', { name: 'Got it' });
  if (await card.isVisible()) await card.click();
  await ev(page, `window.__TTE__.arena.step(91)`);
  const left = await page.evaluate<number>(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 600, 360, 0); a.place(f.id, 900, 360, 4); return m.id; })()`);
  await frames(page);
  for (const status of [5, 10]) await ev(page, `window.__TTE__.arena.grantStatus(${String(left)}, ${String(status)}, 120)`);
  await frames(page);
  await ev(page, `window.__TTE__.arena.step(14)`);
  await expect.poll(() => page.evaluate<number>(`window.__TTE__.arena.statusFx().then((s) => (s ? s.rings.filter((r) => r.id === ${String(left)}).length : 0))`), { message: 'rings drawn' }).toBe(2);
  await frames(page);
  await frames(page);
  const box = await page.locator('#game canvas').boundingBox();
  const at = await page.evaluate<{ x: number; y: number; w: number; h: number; cam: { camZoom: number; scrollX: number } } | undefined>(
    `(async () => { const a = window.__TTE__.arena; const c = a.characters().find((k) => k.id === ${String(left)}); return c && { x: c.x, y: c.y, w: c.w, h: c.h, cam: await a.camera() }; })()`,
  );
  const k = box ? box.width / 1280 : 1;
  const clip = box && at
    ? { x: Math.max(0, box.x + (at.x + at.w / 2 - at.cam.scrollX) * at.cam.camZoom * k - 160), y: Math.max(0, box.y + (at.y + at.h * 0.8) * at.cam.camZoom * k - 150), width: 320, height: 220 }
    : undefined;
  await page.screenshot({ path: join(OUT, `${name}.png`), animations: 'disabled', caret: 'hide', ...(clip ? { clip } : {}) });
}

test('freeze and daze rings with the plates', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await ringShot(page, 'rings-plates');
  expect(errors).toEqual([]);
});

test('freeze and daze rings, procedural fallback (plate requests aborted)', async ({ page }) => {
  test.setTimeout(150_000);
  await page.route('**/assets/img/fx/status/**', (route) => route.abort());
  await ringShot(page, 'rings-procedural');
});
