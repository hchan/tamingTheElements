import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { waitForArena } from './support/wait';

// qa-r125: the combo counter must not draw over the super cut-in band (hud/combo-cut.ts). Long gate: visual, about 20 s.
// SHOT_DIR=<dir> saves a headless screenshot there.
const CHARGE = 1 << 15;
const SUPER = 1 << 13;
const CYCLE = [48, 16 | (1 << 10), 16 | (1 << 6)];
const SHOT_DIR = process.env['SHOT_DIR'];

interface Box { x: number; y: number; w: number; h: number; alpha: number; team: number; hits: number }
const raf2 = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

test('combo counter is hidden where it overlaps the super cut-in band', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await waitForArena(page);
  // Combo on the foe pinned at a spot, then a super while the counter is still held.
  await page.evaluate(`(async () => {
    const a = window.__TTE__.arena;
    a.step(91);
    const [me, foe] = a.characters();
    a.place(me.id, 700, 380, 0);
    for (let i = 0; i < 20; i++) a.step(1, [${String(CHARGE)}, 0]);
    const cycle = ${JSON.stringify(CYCLE)};
    for (let t = 0; t < 300; t++) {
      a.place(foe.id, 780, 380, 4);
      a.step(1, [cycle[t % cycle.length], 0]);
      await new Promise((r) => requestAnimationFrame(r));
      const c = a.fx().comboBoxes.find((b) => b.team === 0);
      if (c && c.hits >= 3) break;
    }
    a.setMeter(0, 3000);
    a.step(1, [${String(SUPER)}, 0]);
  })()`);
  await raf2(page);
  await page.evaluate(`window.__TTE__.arena.step(4)`);
  await raf2(page);
  const probe = await page.evaluate<{ band: { y: number; ext: number } | undefined; boxes: Box[] }>(
    `(async () => ({ band: (await window.__TTE__.arena.superFx())?.band, boxes: window.__TTE__.arena.fx().comboBoxes }))()`,
  );
  expect(probe.band, 'the super cut-in is up').toBeDefined();
  const band = probe.band as { y: number; ext: number };
  const mine = probe.boxes.find((b) => b.team === 0);
  expect(mine, 'the combo counter is still shown').toBeDefined();
  const b = mine as Box;
  const overlaps = b.y + b.h > band.y - band.ext && b.y < band.y + band.ext;
  expect(overlaps, `the counter (y ${String(b.y)}..${String(b.y + b.h)}) overlaps the band (${String(band.y)} +- ${String(band.ext)}), so this test is not vacuous`).toBe(true);
  expect(b.alpha, 'the combo counter is hidden over the cut-in band').toBe(0);
  await testInfo.attach('combo-super-cutin', { body: await page.locator('#game canvas').screenshot(), contentType: 'image/png' });
  if (SHOT_DIR) {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.locator('#game canvas').screenshot({ path: `${SHOT_DIR}/combo-super-cutin.png` });
  }
});
