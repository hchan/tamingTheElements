import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Kit-named action bar (ideas/brainstorm/action-bar-rethink-hero-kits.md): each hero's ability boxes wear the ability's own name and
// the Trap box its element's trap. SHOT_DIR=<dir> saves headless screenshots at desktop and phone-landscape size (never needed to pass).

const SHOT_DIR = process.env['SHOT_DIR'];
const PAIRS = [
  { race: 'curomo', foe: 'lavax', trap: 'Puddle' },
  { race: 'fiara', foe: 'morblass', trap: 'Fire Bomb' },
  { race: 'treenoc', foe: 'echo', trap: 'Spike' },
  { race: 'cyclonius', foe: 'pax', trap: 'Gust' },
] as const;
const SIZES = [{ name: 'desktop', width: 1280, height: 720 }, { name: 'phone', width: 667, height: 375 }] as const;

for (const size of SIZES) {
  for (const p of PAIRS) {
    test(`${p.race} bar is kit-named at ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      const errors = collectErrors(page);
      await page.goto(`${START}&ff=arcade#arcade`);
      await page.getByLabel('Your race').selectOption(p.race);
      await page.getByLabel('AI race').selectOption(p.foe);
      await page.getByRole('button', { name: 'Fight!' }).click();
      await page.waitForFunction(ARENA_READY);
      const card = page.getByRole('button', { name: 'Got it' });
      if (await card.isVisible()) await card.click();
      await page.evaluate(`window.__TTE__.arena.step(91)`);
      await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 500, 360, 0); a.place(f.id, 900, 360, 4); })()`);
      await page.evaluate(`window.__TTE__.arena.step(10)`);
      await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      if (SHOT_DIR) {
        mkdirSync(SHOT_DIR, { recursive: true });
        await page.screenshot({ path: `${SHOT_DIR}/${p.race}-${size.name}.png` });
      }
      expect(errors).toEqual([]);
    });
  }
}
