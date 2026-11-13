import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, collectErrors } from './parity/helpers';

// Weather particle art pass (view only): each element weather runs its grim textured emitter layers (headless
// screenshots go to ~/claudetmp/weather-art-<kind>.png for a visual check); reduced motion runs none; Eclipse has none.
// Page-side code is passed as strings because tsconfig.node has no DOM lib. Manual stepping, effects on view ticks.

const INTRO = 91;
const HOME = process.env['HOME'] ?? '';
const frames = (page: Page, n = 2): Promise<unknown> =>
  page.evaluate(`new Promise((r) => { let n = ${String(n)}; const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })`);
const step = (page: Page, n: number): Promise<unknown> => page.evaluate(`window.__TTE__.arena.step(${String(n)}, [0, 0])`);
const state = async (page: Page): Promise<{ kind: number; emitters: number; tint: number }> => {
  await frames(page);
  return page.evaluate<{ kind: number; emitters: number; tint: number }>(`window.__TTE__.arena.weather()`);
};

async function demo(page: Page): Promise<void> {
  await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await step(page, INTRO);
}

const NAMES = ['sun', 'rain', 'sand', 'gale'] as const;

test('each element weather runs its textured particle layers and fades out with it', async ({ page }) => {
  const errors = collectErrors(page);
  await demo(page);
  for (let kind = 1; kind <= 4; kind++) {
    await page.evaluate(`window.__TTE__.arena.setWeather(${String(kind)}, 0)`);
    await step(page, 60);
    await frames(page, 30);
    const s = await state(page);
    expect(s).toMatchObject({ kind, emitters: 3 });
    expect(s.tint).toBeGreaterThan(0);
    await page.screenshot({ path: `${HOME}/claudetmp/weather-art-${NAMES[kind - 1] ?? 'x'}.png` });
  }
  await page.evaluate(`window.__TTE__.arena.setWeather(5, 0)`);
  await step(page, 5);
  expect(await state(page)).toMatchObject({ kind: 5, emitters: 0 });
  await step(page, 500);
  expect(await state(page)).toMatchObject({ kind: 0, emitters: 0 });
  expect(errors).toEqual([]);
});

test('reduced motion: no particle emitters, the tint stays', async ({ page }) => {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await demo(page);
  await page.evaluate(`window.__TTE__.arena.setWeather(3, 0)`);
  await step(page, 60);
  const s = await state(page);
  expect(s).toMatchObject({ kind: 3, emitters: 0 });
  expect(s.tint).toBeGreaterThan(0);
  await page.screenshot({ path: `${HOME}/claudetmp/weather-art-reduced.png` });
  expect(errors).toEqual([]);
});
