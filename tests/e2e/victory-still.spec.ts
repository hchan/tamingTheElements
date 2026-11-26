import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';
import { waitFor } from './support/wait';

// Roster24 Glimmaw victory still (src/game/fx/victory-still.ts) on the Versus results behind ?ff=roster24: fetched only when
// the screen shows. SHOT_DIR=<dir> saves a headless screenshot. Long gate (no @smoke): a real two-round fight, about 20 s.
const SUPER = 1 << 13;
const SHOT_DIR = process.env['SHOT_DIR'];
const ROUND = 90 + 30 + 120 + 60 + 71;

// Quake supers (umbrel, durrok, quarrak) are rings out to 480 px, so those heroes start close.
const CLOSE = new Set(['umbrel', 'durrok', 'quarrak']);
for (const hero of ['glimmaw', 'kindrel', 'umbrel', 'durrok', 'quarrak']) test(`${hero} wins the match: the victory still replaces the portrait on the results screen`, async ({ page }) => {
  const errors = collectErrors(page);
  const stillRequests: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/assets/img/victory/')) stillRequests.push(r.url()); });
  await page.goto(`${START}&ff=arcade,roster24#arcade`);
  await page.getByLabel('Your race').selectOption(hero);
  await page.getByLabel('AI race').selectOption('fiara');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await waitFor(page, 'arena ready', ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(91)`);
  expect(stillRequests).toEqual([]);
  for (let round = 0; round < 2; round++) {
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 300, 360, 0); a.place(f.id, ${CLOSE.has(hero) ? '540' : '900'}, 360, 4); a.setMeter(0, 1000); a.setHp(f.id, 1); a.step(1, [${String(SUPER)}, 0]); a.step(${String(ROUND)}); })()`);
  }
  await waitFor(page, 'results screen', `!!document.querySelector('#arcadeResults')`);
  await expect(page.locator('#arcadeResults .matchEndStill')).toHaveAttribute('data-hero', hero);
  expect(stillRequests.length).toBe(1);
  if (SHOT_DIR) {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${SHOT_DIR}/${hero}-victory.png` });
  }
  expect(errors).toEqual([]);
});

// Roster24 KO still (src/game/fx/ko-still.ts): the AI hero loses and its still replaces the side card face.
for (const hero of ['umbrel', 'abyssor', 'nykra']) test(`${hero} loses the match: its KO still replaces the portrait on the results screen`, async ({ page }) => {
  const errors = collectErrors(page);
  const koRequests: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/assets/img/ko/')) koRequests.push(r.url()); });
  await page.goto(`${START}&ff=arcade,roster24#arcade`);
  await page.getByLabel('Your race').selectOption('fiara');
  await page.getByLabel('AI race').selectOption(hero);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await waitFor(page, 'arena ready', ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(91)`);
  expect(koRequests).toEqual([]);
  for (let round = 0; round < 2; round++) {
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 300, 360, 0); a.place(f.id, 540, 360, 4); a.setMeter(0, 1000); a.setHp(f.id, 1); a.step(1, [${String(SUPER)}, 0]); a.step(${String(ROUND)}); })()`);
  }
  await waitFor(page, 'results screen', `!!document.querySelector('#arcadeResults')`);
  await expect(page.locator('#arcadeResults .matchEndKoStill')).toHaveAttribute('data-hero', hero);
  expect(koRequests.length).toBe(1);
  if (SHOT_DIR) {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${SHOT_DIR}/${hero}-ko.png` });
  }
  expect(errors).toEqual([]);
});
