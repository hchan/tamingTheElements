import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Distinct per-kind trap art (view only): each of the four trap kinds is laid by a hero of its element, drawn arming and armed,
// and screenshotted headless to the test output dir for a visual check. No page errors, kind and label as expected.

const INTRO = 91;
const HEROES: readonly [race: string, kind: number][] = [['sindarosa', 1], ['curomo', 2], ['pax', 3], ['cyclonius', 4]];

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

// The same decals in a World Tour fight (Arcade ruleset): the lead hero lays two traps, screenshotted armed.
test('trap art: World Tour fight shows the lead hero traps as ground decals', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#tour`);
  await page.getByLabel('Hero 1 (lead)').selectOption('fiara');
  await page.getByLabel('Hero 2').selectOption('rokcore');
  await page.getByLabel('Hero 3').selectOption('curomo');
  await page.getByRole('button', { name: 'Start tour' }).click();
  await page.getByRole('button', { name: 'Fight' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  await page.getByRole('button', { name: 'Got it' }).click({ timeout: 1000 }).catch(() => undefined);
  for (const x of [520, 760]) {
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, ${String(x)}, 560, 0); a.place(foe.id, 1700, 360, 4); })()`);
    await page.keyboard.down('KeyZ');
    await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
    await page.keyboard.up('KeyZ');
    await page.evaluate(`window.__TTE__.arena.stepLive(60)`);
  }
  await frames(page);
  const laid = await page.evaluate<readonly { kind: number }[] | undefined>(`window.__TTE__.arena.traps()`);
  expect(laid?.length).toBeGreaterThan(0);
  await page.locator('#game canvas').screenshot({ path: info.outputPath('tour-traps.png') });
  expect(errors).toEqual([]);
});

for (const [race, kind] of HEROES) {
  test(`trap art: ${race} lays kind ${String(kind)}, arming then armed`, async ({ page }, info) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Your race').selectOption(race);
    await page.getByLabel('AI race').selectOption(race === 'pax' ? 'sindarosa' : 'pax');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 700, 360, 0); a.place(foe.id, 1700, 360, 4); })()`);
    await page.getByRole('button', { name: 'Got it' }).click({ timeout: 1000 }).catch(() => undefined);
    await page.keyboard.down('KeyZ');
    await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
    await page.keyboard.up('KeyZ');
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me] = a.characters(); a.place(me.id, 520, 560, 0); })()`);
    await page.evaluate(`window.__TTE__.arena.stepLive(14)`);
    await frames(page);
    const arming = await page.evaluate<readonly { kind: number; label: string }[] | undefined>(`window.__TTE__.arena.traps()`);
    expect(arming?.[0]?.kind).toBe(kind);
    expect(arming?.[0]?.label).toContain('arming');
    await page.locator('#game canvas').screenshot({ path: info.outputPath(`${race}-arming.png`) });
    await page.evaluate(`window.__TTE__.arena.stepLive(30)`);
    await frames(page);
    const armed = await page.evaluate<readonly { kind: number; label: string }[] | undefined>(`window.__TTE__.arena.traps()`);
    expect(armed?.[0]?.label).not.toContain('arming');
    await page.locator('#game canvas').screenshot({ path: info.outputPath(`${race}-armed.png`) });
    expect(errors).toEqual([]);
  });
}

// At a side wall the decal, range ring and arming label must stay on screen (the sim clamps the box to 0..1920).
// Long gate (no @smoke tag): visual edge case, about 15 s each.
for (const side of ['left', 'right'] as const) {
  test(`trap art: a trap laid against the ${side} wall is not cut off`, async ({ page }, info) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Your race').selectOption('sindarosa');
    await page.getByLabel('AI race').selectOption('pax');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
    await page.getByRole('button', { name: 'Got it' }).click({ timeout: 1000 }).catch(() => undefined);
    const meX = side === 'left' ? 40 : 1800;
    const foeX = side === 'left' ? 0 : 1860; // on the wall side, so the auto-face aims the trap at the wall; moved away right after the cast
    const face = side === 'left' ? 4 : 0;
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, ${String(meX)}, 380, ${String(face)}); a.place(foe.id, ${String(foeX)}, 380, ${String(face)}); })()`);
    await page.keyboard.down('KeyZ');
    await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
    await page.keyboard.up('KeyZ');
    // Heroes step aside right after the cast (off the trap, open-arena side, different rows) so no foe attack or hero body covers the decal, ring or label.
    const asideX = side === 'left' ? 330 : 1590;
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, ${String(asideX)}, 560, ${String(face)}); a.place(foe.id, ${String(side === 'left' ? 520 : 1400)}, 240, ${String(face)}); })()`);
    await page.evaluate(`window.__TTE__.arena.stepLive(14)`);
    await frames(page);
    type Laid = readonly { x: number; label: string; drawnL: number; drawnR: number }[] | undefined;
    const arming = await page.evaluate<Laid>(`window.__TTE__.arena.traps()`);
    await page.locator('#game canvas').screenshot({ path: info.outputPath(`wall-${side}-arming.png`) });
    expect(arming?.[0]?.x).toBe(side === 'left' ? 0 : 1920 - 56); // the box is clamped against the wall
    expect(arming?.[0]?.label).toContain('arming');
    expect.soft(arming?.[0]?.drawnL).toBeGreaterThanOrEqual(0);
    expect.soft(arming?.[0]?.drawnR).toBeLessThanOrEqual(1920);
    await page.evaluate(`window.__TTE__.arena.stepLive(30)`);
    await frames(page);
    const armed = await page.evaluate<Laid>(`window.__TTE__.arena.traps()`);
    await page.locator('#game canvas').screenshot({ path: info.outputPath(`wall-${side}-armed.png`) });
    expect(armed?.[0]?.label).not.toContain('arming');
    expect.soft(armed?.[0]?.drawnL).toBeGreaterThanOrEqual(0);
    expect.soft(armed?.[0]?.drawnR).toBeLessThanOrEqual(1920);
    expect(errors).toEqual([]);
  });
}
