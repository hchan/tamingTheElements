import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Buff/debuff animation (ideas/in-progress/buff-debuff-animation.md): every status gets an apply burst, a loop and an expiry fade on
// the hero, and a chip with a shape icon on the HUD. SHOT_DIR=<dir> saves screenshots (headless; never needed to pass).

interface FxProbe {
  readonly loops: readonly { id: number; status: number }[];
  readonly bursts: readonly { id: number; status: number; age: number }[];
  readonly fades: readonly { id: number; status: number; age: number }[];
}
const INTRO = 91;
const SHOT_DIR = process.env['SHOT_DIR'];
const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const probe = (page: Page): Promise<FxProbe | undefined> => page.evaluate<FxProbe | undefined>(`window.__TTE__.arena.statusFx()`);

async function start(page: Page): Promise<number> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('fiara');
  await page.getByLabel('AI race').selectOption('rokcore');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  const card = page.getByRole('button', { name: 'Got it' });
  if (await card.isVisible()) await card.click();
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  const id = await page.evaluate<number>(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, 600, 360, 0); a.place(f.id, 900, 360, 4); return m.id; })()`);
  await frames(page);
  return id;
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.locator('#game canvas').screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

for (const size of [{ w: 1280, h: 720 }, { w: 800, h: 450 }]) {
  test(`every status bursts, loops and fades, with HUD chips (${String(size.w)}x${String(size.h)})`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: size.w, height: size.h });
    const id = await start(page);
    // Prime: nothing active, so a later status is a fresh apply.
    for (const status of [2, 3, 4, 5, 6, 7, 8, 9]) await page.evaluate(`window.__TTE__.arena.grantStatus(${String(id)}, ${String(status)}, 140)`);
    await page.evaluate(`window.__TTE__.arena.step(4)`);
    await frames(page);
    const fx = await probe(page);
    expect(fx?.bursts.map((b) => b.status).sort()).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    await shot(page, `all-apply-${String(size.w)}`);
    await page.evaluate(`window.__TTE__.arena.step(40)`);
    await frames(page);
    const mid = await probe(page);
    expect(mid?.bursts).toEqual([]);
    // (A hero has 8 status slots, so Rush is left out.) Loops for the statuses without an ability-aura (veil, freeze, slow, fast, guard, tide).
    expect(mid?.loops.map((l) => l.status).sort()).toEqual([4, 5, 6, 7, 8, 9]);
    await shot(page, `all-loop-${String(size.w)}`);
    // Past the end: the fade plays, then clears.
    await page.evaluate(`window.__TTE__.arena.step(100)`);
    await frames(page);
    const end = await probe(page);
    expect(end?.loops).toEqual([]);
    expect(end?.fades.length).toBeGreaterThan(0);
    await shot(page, `all-expire-${String(size.w)}`);
    await page.evaluate(`window.__TTE__.arena.step(40)`);
    await frames(page);
    expect((await probe(page))?.fades).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('reduced motion keeps the cues', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = collectErrors(page);
  const id = await start(page);
  await page.evaluate(`window.__TTE__.arena.grantStatus(${String(id)}, 5, 100)`);
  await page.evaluate(`window.__TTE__.arena.step(3)`);
  await frames(page);
  const fx = await probe(page);
  expect(fx?.bursts.map((b) => b.status)).toEqual([5]);
  await page.evaluate(`window.__TTE__.arena.step(30)`);
  await frames(page);
  expect((await probe(page))?.loops.map((l) => l.status)).toEqual([5]);
  await shot(page, 'reduced-freeze');
  expect(errors).toEqual([]);
});
