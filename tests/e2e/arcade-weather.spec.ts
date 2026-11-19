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
  charge: number;
  chargeText: string;
  chargeFill: number;
}

interface Box { x: number; y: number; w: number; h: number }
const WEATHER = 1 << 14;
/** Round 1's intro (FUN-DESIGN 2.10): nobody acts until tick 91. */
const INTRO = 91;

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const weather = async (page: Page): Promise<Weather | undefined> => {
  await frames(page);
  return page.evaluate<Weather | undefined>(`window.__TTE__.arena.weather()`);
};
/** Fills a team's weather charge (WP-arcade-weather-charge): weather does nothing until it is full. */
const charge = (page: Page, team: number, value = 1000): Promise<unknown> =>
  page.evaluate(`window.__TTE__.arena.setWeatherCharge(${String(team)}, ${String(value)})`);
const step = (page: Page, n: number, cmds: [number, number] = [0, 0]): Promise<unknown> =>
  page.evaluate(`window.__TTE__.arena.step(${String(n)}, [${String(cmds[0])}, ${String(cmds[1])}])`);
/**
 * Every line the live regions have spoken since `listen`. The announcer keeps 1.5 s between polite lines, so a weather
 * call followed by its "The stage will turn to ..." line shows only for that gap; polling the region itself can miss it.
 */
const listen = (page: Page): Promise<unknown> =>
  page.evaluate(`(() => { const heard = []; window.__heard = heard; const note = () => { for (const id of ['liveRegion', 'liveRegionAssertive']) { const t = document.getElementById(id)?.textContent; if (t) heard.push(t); } }; new MutationObserver(note).observe(document.body, { subtree: true, childList: true, characterData: true }); note(); })()`);
const heard = (page: Page): Promise<string> => page.evaluate<string>(`(window.__heard || []).join(' | ')`);

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
  await listen(page);
  await expect.poll(async () => weather(page)).toMatchObject({ kind: 0, label: '', particles: 0, call: '' });
  // Not available from the start: the chip says WEATHER 0%, and R does nothing until the charge is full.
  expect(await weather(page)).toMatchObject({ charge: 0, chargeText: 'WEATHER 0%', chargeFill: 0 });
  await step(page, 1, [WEATHER, 0]);
  // Past the input buffer, so the refused press cannot cast once the charge fills.
  await step(page, 30);
  expect(await weather(page)).toMatchObject({ kind: 0 });
  await charge(page, 0, 600);
  await step(page, 2);
  expect(await weather(page)).toMatchObject({ chargeText: 'WEATHER 60%', chargeFill: 78 });
  await charge(page, 0);
  await step(page, 2);
  expect(await weather(page)).toMatchObject({ chargeText: 'WEATHER READY', chargeFill: 130 });
  await step(page, 1, [WEATHER, 0]);
  await step(page, 5);
  const rain = await weather(page);
  expect(rain).toMatchObject({ kind: 2, label: 'RAIN 10', call: 'Rain!', particles: 28 });
  expect(rain?.tint).toBeGreaterThan(0);
  expect(rain?.callScale).toBeGreaterThan(1);
  await expect.poll(() => heard(page), { timeout: 5000 }).toContain('You called Rain: water hits harder, fire softer.');
  // The called line goes after 1.5 s; the badge counts down and its bar shrinks.
  await step(page, 120);
  const later = await weather(page);
  expect(later).toMatchObject({ kind: 2, label: 'RAIN 8', call: '' });
  expect(later?.fill).toBeLessThan(rain?.fill ?? 0);
  await charge(page, 1);
  await step(page, 1, [0, WEATHER]);
  await step(page, 2);
  expect(await weather(page)).toMatchObject({ kind: 3, label: 'SAND 10', call: 'Sandstorm!', particles: 32 });
  await expect.poll(() => heard(page), { timeout: 5000 }).toContain('The enemy called Sandstorm: earth hits harder, air softer.');
  await page.evaluate(`window.__TTE__.arena.setWeather(5, 1)`);
  await step(page, 2);
  expect(await weather(page)).toMatchObject({ kind: 5, label: 'ECLIPSE 10', call: 'Eclipse!', particles: 10 });
  await expect.poll(() => heard(page), { timeout: 5000 }).toContain('The enemy called Eclipse: void hits harder.');
  // 10 s later the sim ends it: badge, tint and particles go, and the end is spoken.
  await step(page, 500);
  expect(await weather(page)).toMatchObject({ kind: 0, label: '', tint: 0, particles: 0, call: '' });
  await expect.poll(() => heard(page), { timeout: 5000 }).toContain('The Eclipse is over.');
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
  await charge(page, 0);
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
  await listen(page); // the announcer spaces polite lines 1.5 s apart, so polling the region can miss the line under load
  await expect(page.locator('#arcadeWeather')).toBeVisible();
  // Air is at a disadvantage against fire, so the AI calls its Gale on its first free tick (WP-arcade-ai-personalities).
  await charge(page, 1);
  await page.evaluate(`window.__TTE__.arena.stepLive(3)`);
  expect(await weather(page)).toMatchObject({ kind: 4, label: 'GALE 10', call: 'Gale!', particles: 12 });
  await page.screenshot({ path: `${process.env['HOME'] ?? ''}/claudetmp/wv-gale.png` });
  // QA r110: the badge (and charge chip) never sit on a status chip such as "GALE +20%"; chips[0..1] are the teams' status chips, chips[2] the weather boxes.
  await expect.poll(async () => (await page.evaluate<{ chips: Box[][] }>(`window.__TTE__.arena.overlays()`)).chips[2]?.length ?? 0).toBeGreaterThan(0);
  const { chips } = await page.evaluate<{ chips: Box[][] }>(`window.__TTE__.arena.overlays()`);
  expect((chips[0]?.length ?? 0) + (chips[1]?.length ?? 0), 'a status chip is up').toBeGreaterThan(0);
  for (const w of chips[2] ?? []) {
    for (const c of [...(chips[0] ?? []), ...(chips[1] ?? [])]) {
      expect(w.x >= c.x + c.w || c.x >= w.x + w.w || w.y >= c.y + c.h || c.y >= w.y + w.h, `weather box ${JSON.stringify(w)} overlaps chip ${JSON.stringify(c)}`).toBe(true);
    }
  }
  // R (live ticks: the keyboard agent plays the player) replaces it; the AI's weather is on its cooldown.
  await charge(page, 0);
  await page.keyboard.down('KeyR');
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.keyboard.up('KeyR');
  await page.evaluate(`window.__TTE__.arena.stepLive(2)`);
  expect(await weather(page)).toMatchObject({ kind: 1, label: 'SUN 10', call: 'Sunshine!', particles: 5 });
  await page.screenshot({ path: `${process.env['HOME'] ?? ''}/claudetmp/wv-sun.png` });
  // Charged again, the AI (cast first) calls Gale again, then the touch button calls Sunshine again.
  await step(page, 100);
  await charge(page, 0);
  await charge(page, 1);
  await page.evaluate(`window.__TTE__.arena.stepLive(3)`);
  expect(await weather(page)).toMatchObject({ kind: 4, call: 'Gale!' });
  await page.locator('#arcadeWeather').hover();
  await page.mouse.down();
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.mouse.up();
  await page.evaluate(`window.__TTE__.arena.stepLive(2)`);
  expect(await weather(page)).toMatchObject({ kind: 1, call: 'Sunshine!' });
  await expect.poll(() => heard(page), { timeout: 10_000 }).toContain('You called Sunshine: fire hits harder, water softer.');

  await page.keyboard.press('Shift+P');
  await page.waitForFunction(`window.__TTE__.arena.paused === false`);
  await page.keyboard.press('Shift+P');
  await page.getByRole('link', { name: 'Quit to menu' }).click();
  await page.waitForFunction(`window.location.hash === '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  await expect(page.locator('#arcadeWeather')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});
