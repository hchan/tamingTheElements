import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';
import { waitFor, waitForArena } from './support/wait';

// Roster24 super cut-in composite (src/game/fx/cutin-gate.ts, cutin-view.ts) behind ?ff=roster24: a super lazy-loads
// public/assets/img/cutin/<hero>.png once and holds it on the view tick. SHOT_DIR=<dir> saves a headless screenshot.
const SUPER = 1 << 13;
const SHOT_DIR = process.env['SHOT_DIR'];

test('glimmaw super: the cut-in composite loads on first use and shows mid-freeze', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  const frames = (): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const cutinRequests: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/assets/img/cutin/')) cutinRequests.push(r.url()); });
  await page.goto(`${START}&ff=arcade,roster24#arcade`);
  await page.getByLabel('Your race').selectOption('glimmaw');
  await page.getByLabel('AI race').selectOption('fiara');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await waitForArena(page);
  await waitFor(page, 'arena views ready', ARENA_READY);
  const card = page.getByRole('button', { name: 'Got it' });
  if (await card.isVisible()) await card.click();
  expect(cutinRequests).toEqual([]); // nothing preloaded
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(91); const [m, f] = a.characters(); a.place(m.id, 400, 360, 0); a.place(f.id, 900, 360, 4); a.setMeter(0, 1000); a.step(1, [${String(SUPER)}, 0]); })()`);
  await expect(() => { expect(cutinRequests.length, 'cut-in composite requested once').toBe(1); }).toPass();
  await frames();
  await frames();
  await page.evaluate(`window.__TTE__.arena.step(15)`);
  await frames();
  const shot = await page.locator('#game canvas').screenshot();
  await testInfo.attach('glimmaw-cutin', { body: shot, contentType: 'image/png' });
  if (SHOT_DIR) {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.locator('#game canvas').screenshot({ path: `${SHOT_DIR}/glimmaw-cutin.png` });
  }
  expect(errors).toEqual([]);
});
