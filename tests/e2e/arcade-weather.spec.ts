import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Arcade weather view (WP-arcade-weather-view, FUN-DESIGN 2.14 and section 3): every weather cast for real (Rain and
// Sandstorm in the demo, Sunshine and Gale in Arcade Versus) or, for Eclipse (no void race is offered), put up through
// the test probe; the HUD badge (word, seconds, time bar), the sky tint, the particles and the called line; reduced
// motion keeps the badge, tint and line and drops the particles and the scale-in; the R key and the touch Weather
// button; live-region lines; Classic never loads the chunk; 0 listeners after leaving. Page-side code is passed as
// strings because tsconfig.node has no DOM lib. Manual stepping: effects run on the view tick, so they hold between steps.

interface Weather {
  kind: number;
  label: string;
  fill: number;
  tint: number;
  particles: number;
  call: string;
  callScale: number;
}

const WEATHER = 1 << 14;
/** Round 1's intro (FUN-DESIGN 2.10): nobody acts until tick 91. */
const INTRO = 91;

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const weather = async (page: Page): Promise<Weather | undefined> => {
  await frames(page);
  return page.evaluate<Weather | undefined>(`window.__TTE__.arena.weather()`);
};
const step = (page: Page, n: number, cmds: [number, number] = [0, 0]): Promise<unknown> =>
  page.evaluate(`window.__TTE__.arena.step(${String(n)}, [${String(cmds[0])}, ${String(cmds[1])}])`);
const live = (page: Page): Promise<string> =>
  page.evaluate<string>(`[document.getElementById('liveRegion'), document.getElementById('liveRegionAssertive')].map((n) => n ? n.textContent : '').join(' | ')`);

async function demo(page: Page, ff: string): Promise<void> {
  await page.goto(`/?ff=${ff}&manual=1&seed=7`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await step(page, INTRO);
}

async function versus(page: Page, player: string, enemy: string): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption(player);
  await page.getByLabel('AI race').selectOption(enemy);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await step(page, INTRO);
}

test('Arcade demo: Curomo calls Rain, then Pax replaces it with a Sandstorm; Eclipse through the probe; all expire', async ({ page }) => {
  const errors = collectErrors(page);
  await demo(page, 'arenaDemo,arcade');
  await expect.poll(async () => weather(page)).toMatchObject({ kind: 0, label: '', particles: 0, call: '' });
  await step(page, 1, [WEATHER, 0]);
  await step(page, 5);
  const rain = await weather(page);
  expect(rain).toMatchObject({ kind: 2, label: 'RAIN 10', call: 'Rain!', particles: 28 });
  expect(rain?.tint).toBeGreaterThan(0);
  expect(rain?.callScale).toBeGreaterThan(1);
  await expect.poll(() => live(page), { timeout: 5000 }).toContain('You called Rain: water hits harder, fire softer.');
  // The called line goes after 1.5 s; the badge counts down and its bar shrinks.
  await step(page, 120);
  const later = await weather(page);
  expect(later).toMatchObject({ kind: 2, label: 'RAIN 8', call: '' });
  expect(later?.fill).toBeLessThan(rain?.fill ?? 0);
  await step(page, 1, [0, WEATHER]);
  await step(page, 2);
  expect(await weather(page)).toMatchObject({ kind: 3, label: 'SAND 10', call: 'Sandstorm!', particles: 32 });
  await expect.poll(() => live(page), { timeout: 5000 }).toContain('The enemy called Sandstorm: earth hits harder, air softer.');
  await page.evaluate(`window.__TTE__.arena.setWeather(5, 1)`);
  await step(page, 2);
  expect(await weather(page)).toMatchObject({ kind: 5, label: 'ECLIPSE 10', call: 'Eclipse!', particles: 10 });
  await expect.poll(() => live(page), { timeout: 5000 }).toContain('The enemy called Eclipse: void hits harder.');
  // 10 s later the sim ends it: badge, tint and particles go, and the end is spoken.
  await step(page, 500);
  expect(await weather(page)).toMatchObject({ kind: 0, label: '', tint: 0, particles: 0, call: '' });
  await expect.poll(() => live(page), { timeout: 5000 }).toContain('The Eclipse is over.');
  expect(errors).toEqual([]);
});

test('reduced motion: badge, steady tint and line at full size, no particles; Classic never loads the view', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await demo(page, 'arenaDemo');
  await step(page, 60, [WEATHER, WEATHER]);
  await frames(page);
  expect(requested.filter((u) => u.includes('weather-view'))).toEqual([]);
  expect(await page.evaluate(`window.__TTE__.arena.weather()`)).toBeUndefined();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await demo(page, 'arenaDemo,arcade');
  await expect.poll(async () => weather(page)).toMatchObject({ kind: 0 });
  await step(page, 1, [WEATHER, 0]);
  await step(page, 1);
  const w = await weather(page);
  expect(w).toMatchObject({ kind: 2, label: 'RAIN 10', call: 'Rain!', callScale: 1, particles: 0 });
  // Steady at once: no fade-in.
  expect(w?.tint).toBeCloseTo(0.2, 5);
});

test('Arcade Versus: the AI calls Gale, R calls Sunshine, the touch Weather button too; 0 listeners after', async ({ page }) => {
  const errors = collectErrors(page);
  await versus(page, 'sindarosa', 'cyclonius');
  await expect(page.locator('#arcadeWeather')).toBeVisible();
  // Air is at a disadvantage against fire, so the AI calls its Gale on its first free tick (WP-arcade-ai-personalities).
  await page.evaluate(`window.__TTE__.arena.stepLive(3)`);
  expect(await weather(page)).toMatchObject({ kind: 4, label: 'GALE 10', call: 'Gale!', particles: 12 });
  await page.screenshot({ path: `${process.env['HOME'] ?? ''}/claudetmp/wv-gale.png` });
  // R (live ticks: the keyboard agent plays the player) replaces it; the AI's weather is on its cooldown.
  await page.keyboard.down('KeyR');
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.keyboard.up('KeyR');
  await page.evaluate(`window.__TTE__.arena.stepLive(2)`);
  expect(await weather(page)).toMatchObject({ kind: 1, label: 'SUN 10', call: 'Sunshine!', particles: 5 });
  await page.screenshot({ path: `${process.env['HOME'] ?? ''}/claudetmp/wv-sun.png` });
  // After both 30 s cooldowns the AI (cast first) calls Gale again, then the touch button calls Sunshine again.
  await step(page, 1500);
  await page.evaluate(`window.__TTE__.arena.stepLive(3)`);
  expect(await weather(page)).toMatchObject({ kind: 4, call: 'Gale!' });
  await page.locator('#arcadeWeather').hover();
  await page.mouse.down();
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.mouse.up();
  await page.evaluate(`window.__TTE__.arena.stepLive(2)`);
  expect(await weather(page)).toMatchObject({ kind: 1, call: 'Sunshine!' });
  await expect.poll(() => live(page), { timeout: 5000 }).toContain('You called Sunshine: fire hits harder, water softer.');

  await page.keyboard.press('Shift+P');
  await page.waitForFunction(`window.__TTE__.arena.paused === false`);
  await page.keyboard.press('Shift+P');
  await page.getByRole('link', { name: 'Exit to menu' }).click();
  await page.waitForFunction(`window.location.hash === '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  await expect(page.locator('#arcadeWeather')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});
