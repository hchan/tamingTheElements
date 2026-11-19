import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START } from './parity/helpers';

// Water (rain) stage floor chips (QA r40): the "WATER +HP" chips sit on dark plates under the fighters, read at full alpha when nobody is near,
// and fade out of a fighter's way. The stage is forced by Curomo (water) calling its weather. Shots to $SHOT_DIR when set.
const shotDir = process.env['SHOT_DIR'];
const WEATHER = 1 << 14;
const INTRO = 91;
const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

interface Box { x: number; y: number; w: number; h: number }
interface Chip extends Box { alpha: number; slot: number }
interface Terrain { stage: number; labels: string[]; chips: Chip[]; chipDepth: number; labelDepth: number; view: Box; bodies: Box[] }
const meets = (a: Box, b: Box): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const terrain = async (page: Page): Promise<Terrain> => {
  await frames(page);
  const t = await page.evaluate<Terrain | undefined>(`window.__TTE__.arena.terrain()`);
  if (!t) throw new Error('no terrain');
  return t;
};

test('water stage: chips are solid plates under the fighters, and fade near a fighter', async ({ page }, info) => {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('curomo');
  await page.getByLabel('AI race').selectOption('fiara');
  await page.getByRole('button', { name: /^Fight/ }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO + 20)})`);
  await page.evaluate(`document.querySelector('.firstRunDone')?.click()`);
  if ((await terrain(page)).stage !== 2) {
    await page.evaluate(`window.__TTE__.arena.setWeatherCharge(0, 1000)`);
    await page.evaluate(`window.__TTE__.arena.step(1, [${String(WEATHER)}, 0])`);
    await page.evaluate(`window.__TTE__.arena.step(60)`);
  }
  // Park both fighters well away from every chip so the chips read at full strength.
  const park = (): Promise<unknown> =>
    page.evaluate(`(() => { const a = window.__TTE__.arena; for (const c of a.characters()) a.place(c.id, c.team === 0 ? 60 : 1100, 640, 0); a.step(1); })()`);
  await park();
  let t = await terrain(page);
  // A chip that flipped away from a head eases back in from 0.15 (about 13 frames); frames do not age the hint, only step does.
  for (let i = 0; i < 30 && t.chips.some((c) => c.alpha > 0 && c.alpha < 0.9); i++) t = await terrain(page);
  for (const c of t.chips) for (const b of t.bodies) expect(meets(c, b), 'park spots clear of every chip').toBe(false);
  expect(t.stage).toBe(2);
  expect(t.labels.length).toBeGreaterThanOrEqual(3);
  expect(t.labels.every((l) => /WATER|HP|HEAL/i.test(l))).toBe(true);
  expect(t.chipDepth).toBeLessThan(-0.6);
  expect(t.labelDepth).toBeLessThan(-0.6);
  const shown = t.chips.filter((c) => c.alpha > 0);
  expect(shown.length).toBe(1); // chipOwner (qa-r112): one floor chip per arena, the rest stay hidden
  for (const c of shown) expect(c.alpha).toBeGreaterThanOrEqual(0.9);
  const far = `${shotDir ?? info.outputDir}/water-chips-far.png`;
  await page.screenshot({ path: far });

  // A fighter stepping onto the first chip makes it (and only the near ones) fade; the far chips stay solid.
  const first = shown[0];
  if (!first) throw new Error('no chip');
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const me = a.characters().find((c) => c.team === 0); a.place(me.id, ${String(first.x + first.w / 2 - 40)}, ${String(first.y - 20)}, 0); a.step(1); })()`);
  for (let i = 0; i < 6; i++) t = await terrain(page);
  const c0 = t.chips[0];
  expect((c0?.alpha ?? 1) <= 0.25 || !t.bodies.some((b) => c0 !== undefined && meets(c0, b))).toBe(true);
  expect(Math.max(...t.chips.map((c) => c.alpha))).toBeGreaterThanOrEqual(0.9);
  await page.screenshot({ path: `${shotDir ?? info.outputDir}/water-chips-near.png` });

  // Edges: both fighters at a wall (the pan camera eases there); every visible chip is whole inside the view.
  const wall = async (xs: [number, number], name: string): Promise<void> => {
    await page.evaluate(`(() => { const a = window.__TTE__.arena; for (const c of a.characters()) a.place(c.id, c.team === 0 ? ${String(xs[0])} : ${String(xs[1])}, 640, 0); a.step(1); })()`);
    for (let i = 0; i < 10; i++) {
      const w = await terrain(page);
      for (const c of w.chips) {
        if (c.alpha <= 0 || !meets(c, w.view)) continue;
        expect(c.x).toBeGreaterThanOrEqual(w.view.x + 15);
        expect(c.x + c.w).toBeLessThanOrEqual(w.view.x + w.view.w - 15);
      }
    }
    await page.screenshot({ path: `${shotDir ?? info.outputDir}/${name}.png` });
  };
  await wall([40, 200], 'water-chips-edge-left');
  await wall([1700, 1860], 'water-chips-edge-right');

  // Head: team 0's drawn (up to 2x) head covers a chip while its sim box is outside the old near window; the chip must flip or fade.
  const me = await page.evaluate<{ id: number; w: number; h: number }>(`(() => { const c = window.__TTE__.arena.characters().find((c) => c.team === 0); return { id: c.id, w: c.w, h: c.h }; })()`);
  const k = Math.max(1.25, Math.min(2, 200 / me.h));
  t = await terrain(page);
  const target = t.chips.find((c) => c.y + c.h + 24 + 50 + me.h < 700 && c.y + c.h + 24 + 50 + me.h > 0 && c.alpha > 0);
  if (!target) throw new Error('no chip with room below');
  const y = target.y + target.h + 24 + Math.min(50, Math.floor(me.h * (k - 1)) - 25);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.place(${String(me.id)}, ${String(target.x + target.w / 2 - me.w / 2)}, ${String(y)}, 0); a.step(1); })()`);
  for (let i = 0; i < 12; i++) {
    const h = await terrain(page);
    if (i < 5) continue;
    for (const c of h.chips) expect(c.alpha <= 0.25 || !h.bodies.some((b) => meets(c, b))).toBe(true);
  }
  await page.screenshot({ path: `${shotDir ?? info.outputDir}/water-chips-head.png` });
});

// QA r74 (CHIP-FADE-1): a chip must be opaque or hidden, never faint. The hint clock starts when the words first show (not under
// the intro banners), and a chip that flips slot lands opaque. Draws run during the intro, as in live play.
test('water stage: chips clear of the fighters read at full alpha 140 ticks after they first show', async ({ page }) => {
  await page.goto(`${START}&ff=arcade#versus`);
  await page.getByLabel('Your race').selectOption('ishimi');
  await page.getByLabel('AI race').selectOption('fiara');
  await page.locator('button.vsSegment', { hasText: 'Water' }).first().click();
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`document.querySelector('.firstRunDone')?.click()`);
  const chunk = async (): Promise<Terrain> => {
    await page.evaluate(`window.__TTE__.arena.stepLive(5)`);
    return terrain(page);
  };
  let t = await chunk();
  let ticks = 5;
  while (!t.chips.some((c) => c.alpha > 0) && ticks < 400) {
    t = await chunk();
    ticks += 5;
  }
  expect(t.chips.some((c) => c.alpha > 0), 'chips show after the banners').toBe(true);
  for (let i = 0; i < 28; i++) t = await chunk(); // 140 ticks after the words first show: still inside the 200-tick hint
  // Let the per-frame ease settle (frames do not age the hint, only ticks do).
  for (let i = 0; i < 20 && t.chips.some((c) => c.alpha > 0 && c.alpha < 0.9 && !t.bodies.some((b) => meets(c, b))); i++) t = await terrain(page);
  const pa = (await page.evaluate<{ alpha: number }>(`window.__TTE__.arena.terrain()`)).alpha;
  const shown = t.chips.filter((c) => c.alpha > 0);
  expect(shown.length).toBeGreaterThan(0);
  for (const c of shown) if (!t.bodies.some((b) => meets(c, b))) expect(c.alpha).toBeGreaterThanOrEqual(0.9 * pa);
});
