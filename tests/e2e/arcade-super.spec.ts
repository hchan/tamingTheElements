import { expect, test, type Page } from '@playwright/test';

// Super cinematic in the browser (WP-arcade-super-view): dim, element cut-in, camera punch-in; reduced motion keeps the
// information and drops the motion; Classic never shows it; it adds no listeners. Page-side code is passed as
// strings because tsconfig.node has no DOM lib. Manual stepping: the cinematic runs on the view tick, so it holds
// between steps and a step moves it on.
const ARENA_READY = `window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`;
const SUPER = 1 << 13;
/** Arcade round 1's intro (FUN-DESIGN 2.10): nobody acts until tick 91; Classic has none. */
const INTRO = 91;

interface SuperFx {
  dim: number;
  bandAlpha: number;
  slide: number;
  zoom: number;
  name: string;
  sub: string;
  camZoom: number;
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const superFx = (page: Page): Promise<SuperFx | undefined> => page.evaluate<SuperFx | undefined>(`window.__TTE__.arena.superFx()`);

/** Demo arena (Curomo vs Pax) with a full bar for Curomo, who presses the super and holds `ticks` more into the freeze. */
async function castSuper(page: Page, ff: string, ticks: number): Promise<void> {
  await page.goto(`/?ff=${ff}&manual=1&seed=7`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await cast(page, ticks, ff.includes('arcade'));
}

async function cast(page: Page, ticks: number, arcade = true): Promise<void> {
  await page.evaluate(`(() => {
    const a = window.__TTE__.arena;
    a.step(${String(arcade ? INTRO : 0)});
    const [me, foe] = a.characters();
    a.place(me.id, 300, 360, 0);
    a.place(foe.id, 900, 360, 4);
    a.setMeter(0, 1000);
    a.step(1, [${String(SUPER)}, 0]);
    a.step(${String(ticks)});
  })()`);
}

test('Arcade: a super dims the arena, slides in the element cut-in and punches the camera in', async ({ page }) => {
  const errors = collectErrors(page);
  await castSuper(page, 'arenaDemo,arcade', 5);
  // The cinematic code loads on the first super, then follows the view tick.
  await expect.poll(async () => (await superFx(page))?.name).toBe('GLACIER CRASH');
  await frames(page);
  const f = await superFx(page);
  expect(f?.sub).toBe('WATER');
  expect(f?.dim).toBeCloseTo(0.6, 2);
  expect(f?.bandAlpha).toBe(1);
  expect(f?.zoom).toBeGreaterThan(1);
  expect(f?.camZoom).toBeCloseTo(f?.zoom ?? 0, 3);
  // Paused frames hold it; stepping past the 40-tick freeze ends it and restores the camera.
  await frames(page);
  expect(await superFx(page)).toEqual(f);
  await page.evaluate(`window.__TTE__.arena.step(40)`);
  await frames(page);
  expect(await superFx(page)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('Arcade with reduced motion: no slide or punch-in, but the dim, band and name stay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = collectErrors(page);
  await castSuper(page, 'arenaDemo,arcade', 10);
  await expect.poll(async () => (await superFx(page))?.name).toBe('GLACIER CRASH');
  await frames(page);
  const f = await superFx(page);
  expect(f?.slide).toBe(0);
  expect(f?.zoom).toBe(1);
  expect(f?.camZoom).toBe(1);
  expect(f?.dim).toBeCloseTo(0.6, 2);
  expect(f?.bandAlpha).toBe(1);
  expect(await page.evaluate<boolean>(`window.__TTE__.arena.shaking()`)).toBe(false);
  expect(errors).toEqual([]);
});

test('Classic: the super bit does nothing and no cinematic shows', async ({ page }) => {
  const errors = collectErrors(page);
  await castSuper(page, 'arenaDemo', 5);
  await frames(page);
  expect(await superFx(page)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('Arcade: the super adds no window or document listeners (the arena teardown count is unchanged)', async ({ page }) => {
  // The Arcade arena is only reachable through the demo until WP-arcade-entry, which has no exit route; the cinematic
  // only uses scene events (dropped with the scene), so the counted listeners must not move.
  const errors = collectErrors(page);
  await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7');
  await page.waitForFunction(ARENA_READY);
  const before = await page.evaluate<number>(`window.__TTE__.listeners()`);
  await cast(page, 5);
  await expect.poll(async () => (await superFx(page))?.name).toBe('GLACIER CRASH');
  await page.evaluate(`window.__TTE__.arena.step(45)`);
  await frames(page);
  expect(await superFx(page)).toBeUndefined();
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(before);
  expect(errors).toEqual([]);
});
