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
for (const hero of ['umbrel', 'abyssor', 'nykra', 'glimmaw', 'quarrak', 'ouroth', 'brazgor', 'treenoc']) test(`${hero} loses the match: its KO still replaces the portrait on the results screen`, async ({ page }) => {
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

// Procedural KO collapse (src/game/fx/ko-collapse.ts): Fiara, Cyclonius, Lavax, Morblass and Rokcore lose and the Large portrait collapses at its base; Wispera, Echo and Ishimi fell back to the plain loser face (no collapse element).
// Long gate: a real two-round fight, about 20 s each. SHOT_DIR saves the headless screenshot.
const PLAIN_FACE = new Set(['wispera', 'echo', 'ishimi']);
for (const hero of ['fiara', 'cyclonius', 'wispera', 'lavax', 'morblass', 'echo', 'rokcore', 'ishimi']) test(`${hero} loses the match: ${PLAIN_FACE.has(hero) ? 'the plain loser face stays' : 'its portrait collapses'} on the results screen`, async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade,roster24#arcade`);
  await page.getByLabel('Your race').selectOption(hero === 'fiara' ? 'glimmaw' : 'fiara');
  await page.getByLabel('AI race').selectOption(hero);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await waitFor(page, 'arena ready', ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(91)`);
  for (let round = 0; round < 2; round++) {
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 300, 360, 0); a.place(f.id, 540, 360, 4); a.setMeter(0, 1000); a.setHp(f.id, 1); a.step(1, [${String(SUPER)}, 0]); a.step(${String(ROUND)}); })()`);
  }
  await waitFor(page, 'results screen', `!!document.querySelector('#arcadeResults')`);
  if (PLAIN_FACE.has(hero)) {
    await expect(page.locator('#arcadeResults .matchEndFace').first()).toBeVisible();
    await expect(page.locator('#arcadeResults .matchEndKoCollapse')).toHaveCount(0);
    expect(errors).toEqual([]);
    return;
  }
  await expect(page.locator('#arcadeResults .matchEndKoCollapse')).toHaveAttribute('data-hero', hero);
  await waitFor(page, 'collapse end state', `document.querySelector('.matchEndKoCollapse')?.getAnimations({ subtree: true }).every((a) => a.playState === 'finished') === true`);
  await test.info().attach(`${hero}-collapse`, { body: await page.screenshot(), contentType: 'image/png' }); // fetched with the router's test-results
  if (SHOT_DIR) {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${SHOT_DIR}/${hero}-collapse.png` });
  }
  expect(errors).toEqual([]);
});

// Originals' stills (victory: curomo, wispera; KO: sindarosa, curomo): released heroes, the flag is kept for parity with the loops above.
// Long gate (no @smoke): a real two-round fight, about 20 s each.
const ORIGINALS: Array<['victory' | 'ko', string]> = [['victory', 'curomo'], ['victory', 'wispera'], ['ko', 'sindarosa'], ['ko', 'curomo']];
for (const [kind, hero] of ORIGINALS) test(`${hero} ${kind === 'victory' ? 'wins' : 'loses'} the match: its original ${kind} still shows on the results screen`, async ({ page }) => {
  const errors = collectErrors(page);
  const requests: string[] = [];
  page.on('request', (r) => { if (r.url().includes(`/assets/img/${kind}/`)) requests.push(r.url()); });
  await page.goto(`${START}&ff=arcade,roster24#arcade`);
  await page.getByLabel('Your race').selectOption(kind === 'victory' ? hero : 'fiara');
  await page.getByLabel('AI race').selectOption(kind === 'victory' ? 'fiara' : hero);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await waitFor(page, 'arena ready', ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(91)`);
  for (let round = 0; round < 2; round++) {
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 300, 360, 0); a.place(f.id, 540, 360, 4); a.setMeter(0, 1000); a.setHp(f.id, 1); a.step(1, [${String(SUPER)}, 0]); a.step(${String(ROUND)}); })()`);
  }
  await waitFor(page, 'results screen', `!!document.querySelector('#arcadeResults')`);
  await expect(page.locator(`#arcadeResults ${kind === 'victory' ? '.matchEndStill' : '.matchEndKoStill'}`)).toHaveAttribute('data-hero', hero);
  expect(requests.length).toBe(1);
  await test.info().attach(`${hero}-${kind}`, { body: await page.screenshot(), contentType: 'image/png' }); // fetched with the router's test-results
  if (SHOT_DIR) {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${SHOT_DIR}/${hero}-${kind}-original.png` });
  }
  expect(errors).toEqual([]);
});
