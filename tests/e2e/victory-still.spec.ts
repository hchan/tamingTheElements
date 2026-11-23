import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';
import { waitFor } from './support/wait';

// Roster24 Glimmaw victory still (src/game/fx/victory-still.ts) on the Versus results behind ?ff=roster24: fetched only when
// the screen shows. SHOT_DIR=<dir> saves a headless screenshot. Long gate (no @smoke): a real two-round fight, about 20 s.
const SUPER = 1 << 13;
const SHOT_DIR = process.env['SHOT_DIR'];
const ROUND = 90 + 30 + 120 + 60 + 71;

test('glimmaw wins the match: the victory still replaces the portrait on the results screen', async ({ page }) => {
  const errors = collectErrors(page);
  const stillRequests: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/assets/img/victory/')) stillRequests.push(r.url()); });
  await page.goto(`${START}&ff=arcade,roster24#arcade`);
  await page.getByLabel('Your race').selectOption('glimmaw');
  await page.getByLabel('AI race').selectOption('fiara');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await waitFor(page, 'arena ready', ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(91)`);
  expect(stillRequests).toEqual([]);
  for (let round = 0; round < 2; round++) {
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 300, 360, 0); a.place(f.id, 900, 360, 4); a.setMeter(0, 1000); a.setHp(f.id, 1); a.step(1, [${String(SUPER)}, 0]); a.step(${String(ROUND)}); })()`);
  }
  await waitFor(page, 'results screen', `!!document.querySelector('#arcadeResults')`);
  await expect(page.locator('#arcadeResults .matchEndStill')).toHaveAttribute('data-hero', 'glimmaw');
  expect(stillRequests.length).toBe(1);
  if (SHOT_DIR) {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${SHOT_DIR}/glimmaw-victory.png` });
  }
  expect(errors).toEqual([]);
});
