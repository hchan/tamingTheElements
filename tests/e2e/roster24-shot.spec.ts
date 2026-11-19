import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Roster 24 batches 1-3 (b1 Kindrel, Nykra, Quarrak, Hyalia; b2 Brazgor, Glimmaw, Durrok, Zephra; b3 Ouroth, Abyssor, Vortigal, Umbrel) behind ?ff=roster24: each hero faces Fiara on the Arcade stage and renders from
// its own atlas; SHOT_DIR=<dir> saves headless screenshots for eyeballing (never needed to pass).

const SHOT_DIR = process.env['SHOT_DIR'];
const BATCHES = {
  b1: ['kindrel', 'nykra', 'quarrak', 'hyalia'],
  b2: ['brazgor', 'glimmaw', 'durrok', 'zephra'],
  b3: ['ouroth', 'abyssor', 'vortigal', 'umbrel'],
} as const;
const HEROES = [...BATCHES.b1, ...BATCHES.b2, ...BATCHES.b3];

for (const race of HEROES) {
  test(`${race} vs fiara renders from its sheet`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade,roster24#arcade`);
    await page.getByLabel('Your race').selectOption(race);
    await page.getByLabel('AI race').selectOption('fiara');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    const card = page.getByRole('button', { name: 'Got it' });
    if (await card.isVisible()) await card.click();
    await page.evaluate(`window.__TTE__.arena.step(91)`);
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 600, 360, 0); a.place(f.id, 800, 360, 4); })()`);
    await page.evaluate(`window.__TTE__.arena.step(20)`);
    await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const sheets = await page.evaluate<{ characters: { texture: string }[] } | undefined>('window.__TTE__.arena.sheets()');
    expect(sheets?.characters.some((c) => c.texture.endsWith(`:${race}`)), JSON.stringify(sheets)).toBe(true);
    if (SHOT_DIR) {
      mkdirSync(SHOT_DIR, { recursive: true });
      await page.screenshot({ path: `${SHOT_DIR}/${race}-vs-fiara.png` });
    }
    expect(errors).toEqual([]);
  });
}
