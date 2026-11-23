import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';
import { waitForArena } from './support/wait';

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

// Kindrel cast FX (src/game/fx/kindrel-fx.ts): Ember Bite (primary) and Cinder Spray (secondary) shots 1, 5 and 10 ticks after the cast.
const KINDREL_CASTS = [
  { name: 'ember-bite', cmd: 16, gap: 120 },
  { name: 'cinder-spray', cmd: 32, gap: 300 },
] as const;
// Glimmaw Lure Orb (src/game/fx/glimmaw-fx.ts), primary ability, ranged gap.
const GLIMMAW_CASTS = [{ name: 'lure-orb', cmd: 16, gap: 300 }] as const;

for (const c of [...KINDREL_CASTS.map((k) => ({ ...k, hero: 'kindrel' })), ...GLIMMAW_CASTS.map((k) => ({ ...k, hero: 'glimmaw' }))]) {
  test(`${c.hero} ${c.name}: cast shots, no page errors`, async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    const frames = (): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    await page.goto(`${START}&ff=arcade,roster24#arcade`);
    await page.getByLabel('Your race').selectOption(c.hero);
    await page.getByLabel('AI race').selectOption('fiara');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await waitForArena(page);
    const card = page.getByRole('button', { name: 'Got it' });
    if (await card.isVisible()) await card.click();
    await page.evaluate(`window.__TTE__.arena.step(91)`);
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 700, 360, 0); a.place(f.id, ${String(700 + c.gap)}, 360, 4); })()`);
    await frames(); // the aura view must sample the pre-cast cooldown first
    await page.evaluate(`window.__TTE__.arena.step(1, [${String(c.cmd)}, 0])`);
    let done = 1;
    for (const at of [1, 5, 10]) {
      await page.evaluate(`window.__TTE__.arena.step(${String(at - done)})`);
      done = at;
      await frames();
      // Attached (not SHOT_DIR) so a remote PC run returns the shots in test-results.
      await testInfo.attach(`${c.hero}-${c.name}-${String(at)}`, { body: await page.locator('#game canvas').screenshot(), contentType: 'image/png' });
    }
    expect(errors).toEqual([]);
  });
}
