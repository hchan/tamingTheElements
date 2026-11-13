import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Elemental Cleanse presentation (ideas/in-progress/elemental-cleanse): the common Cleanse command plays a per-element animation
// on the casting hero and asks for the `cleanse` cue. SHOT_DIR=<dir> saves screenshots (headless; never needed to pass).

interface Probe {
  readonly active: readonly { id: number; element: string; age: number }[];
  readonly parts: number;
  readonly reduced: boolean;
  readonly started: number;
}
const INTRO = 91;
const CLEANSE = 512; // Cmd.cleanse = 1 << 9
const SHOT_DIR = process.env['SHOT_DIR'];
const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const probe = (page: Page): Promise<Probe | undefined> => page.evaluate<Probe | undefined>(`window.__TTE__.arena.cleanse()`);
const sfx = (page: Page): Promise<string[]> => page.evaluate<string[]>(`window.__TTE__.sfxLog.slice()`);

const HEROES = [
  { race: 'curomo', element: 'water' },
  { race: 'fiara', element: 'fire' },
  { race: 'rokcore', element: 'earth' },
  { race: 'cyclonius', element: 'air' },
] as const;

for (const h of HEROES) {
  test(`Cleanse plays the ${h.element} animation and the ${h.element} cue`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Your race').selectOption(h.race);
    await page.getByLabel('AI race').selectOption(h.race === 'rokcore' ? 'fiara' : 'rokcore');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    const card = page.getByRole('button', { name: 'Got it' });
    if (await card.isVisible()) await card.click();
    await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 600, 360, 0); a.place(f.id, 900, 360, 4); })()`);
    await page.evaluate(`window.__TTE__.arena.step(1, [${String(CLEANSE)}, 0])`);
    await expect.poll(async () => (await sfx(page)).includes(`cleanse:${h.element}`)).toBe(true);
    await frames(page);
    await expect.poll(async () => (await probe(page))?.active.map((a) => a.element)).toEqual([h.element]);
    await page.evaluate(`window.__TTE__.arena.step(6)`);
    await frames(page);
    expect((await probe(page))?.parts).toBeGreaterThan(0);
    // Advance the view a little so the scene is mid-way for the screenshot.
    await page.evaluate(`window.__TTE__.arena.step(12)`);
    await frames(page);
    if (SHOT_DIR) {
      mkdirSync(SHOT_DIR, { recursive: true });
      await page.locator('#game canvas').screenshot({ path: `${SHOT_DIR}/cleanse-${h.element}.png` });
    }
    await page.evaluate(`window.__TTE__.arena.step(60)`);
    await frames(page);
    await expect.poll(async () => (await probe(page))?.active.length).toBe(0);
    expect(errors).toEqual([]);
    await page.evaluate(`window.__TTE__.settled()`);
  });
}
