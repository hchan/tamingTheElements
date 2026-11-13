import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Ishimi, Morblass and Echo as grim elemental beings (ideas/in-progress/elemental-heroes-grim): each hero faces a foil on the Arcade stage;
// SHOT_DIR=<dir> saves headless screenshots for eyeballing (never needed to pass).

const SHOT_DIR = process.env['SHOT_DIR'];
const PAIRS = [
  { race: 'ishimi', foe: 'fiara' },
  { race: 'morblass', foe: 'curomo' },
  { race: 'echo', foe: 'rokcore' },
  { race: 'ishimi', foe: 'echo' },
  { race: 'morblass', foe: 'cyclonius' },
] as const;

for (const p of PAIRS) {
  test(`${p.race} vs ${p.foe} renders from its sheet`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Your race').selectOption(p.race);
    await page.getByLabel('AI race').selectOption(p.foe);
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    const card = page.getByRole('button', { name: 'Got it' });
    if (await card.isVisible()) await card.click();
    await page.evaluate(`window.__TTE__.arena.step(91)`);
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 600, 360, 0); a.place(f.id, 900, 360, 4); })()`);
    await page.evaluate(`window.__TTE__.arena.step(20)`);
    await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    if (SHOT_DIR) {
      mkdirSync(SHOT_DIR, { recursive: true });
      await page.screenshot({ path: `${SHOT_DIR}/${p.race}-vs-${p.foe}.png` });
    }
    expect(errors).toEqual([]);
  });
}
