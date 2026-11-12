import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// The panning Arcade camera in the browser (WP 38f; camera rules in FUN-DESIGN 2.1). The sim is paused (`manual=1`), so
// the fighters stay where `place` puts them and the view eases on real frames; waits are on the camera hook, never a timer.
// Page-side code is passed as strings (no DOM lib in tsconfig.node).

const WORLD = 1920;
const VIEW = 1280;
const ZOOM_MIN = 0.8;
const MARGIN = 160;
const HERO_W = 80;
const EPS = 0.5;

interface Cam {
  centerX: number;
  zoom: number;
  camZoom: number;
  scrollX: number;
}

const camera = (page: Page): Promise<Cam> => page.evaluate<Cam>(`window.__TTE__.arena.camera()`);

/** Places the first two fighters (left edge x each) and waits until the camera has eased onto the ideal framing for them. */
async function placeAndSettle(page: Page, x1: number, x2: number): Promise<Cam> {
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, ${String(x1)}, 380, 0); a.place(foe.id, ${String(x2)}, 380, 4); })()`);
  const mid = (x1 + x2 + HERO_W) / 2;
  const zoom = Math.min(1, Math.max(ZOOM_MIN, VIEW / (Math.abs(x1 - x2) + 2 * MARGIN)));
  const half = VIEW / zoom / 2;
  const centerX = Math.min(WORLD - half, Math.max(half, mid));
  // The camera eases on real frames; poll the hook (waitForFunction would treat its promise as truthy at once).
  await expect
    .poll(async () => {
      const c = await camera(page);
      return Math.abs(c.centerX - centerX) < 1 && Math.abs(c.zoom - zoom) < 0.01;
    }, { timeout: 10_000 })
    .toBe(true);
  return camera(page);
}

/** The visible world span at this framing. */
const span = (c: Cam): [number, number] => [c.centerX - VIEW / c.zoom / 2, c.centerX + VIEW / c.zoom / 2];

/** Arcade Versus from the menu route (the pan camera mounts with the Arcade launch, not with the `arenaDemo` hook), past round 1's intro. */
async function openArcade(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(91)`);
}

test('Arcade: far-apart fighters zoom out to the floor and the view stays inside the 1920 world', async ({ page }) => {
  const errors = collectErrors(page);
  await openArcade(page);
  const c = await placeAndSettle(page, 200, 1700);
  expect(c.zoom).toBeCloseTo(ZOOM_MIN, 2);
  expect(c.camZoom).toBeCloseTo(ZOOM_MIN, 2);
  const [l, r] = span(c);
  expect(l).toBeGreaterThanOrEqual(-EPS);
  expect(r).toBeLessThanOrEqual(WORLD + EPS);
  // Both fighters are inside the visible window (the clamp may shave the margin, never the fighter).
  expect(l).toBeLessThanOrEqual(200);
  expect(r).toBeGreaterThanOrEqual(1700 + HERO_W);
  expect(errors).toEqual([]);
});

test('Arcade: close fighters at each wall pin the view to that wall at zoom 1; mid-field follows the midpoint', async ({ page }) => {
  const errors = collectErrors(page);
  await openArcade(page);
  const left = await placeAndSettle(page, 100, 300);
  expect(left.zoom).toBeCloseTo(1, 2);
  expect(span(left)[0]).toBeCloseTo(0, 0);
  const mid = await placeAndSettle(page, 760, 960);
  expect(mid.centerX).toBeCloseTo(900, 0);
  expect(mid.zoom).toBeCloseTo(1, 2);
  const right = await placeAndSettle(page, 1600, 1800);
  expect(right.zoom).toBeCloseTo(1, 2);
  expect(span(right)[1]).toBeCloseTo(WORLD, 0);
  expect(right.scrollX).toBeGreaterThan(mid.scrollX);
  expect(mid.scrollX).toBeGreaterThan(left.scrollX);
  expect(left.scrollX).toBeGreaterThanOrEqual(-EPS);
  expect(right.scrollX).toBeLessThanOrEqual(WORLD - VIEW + EPS);
  expect(errors).toEqual([]);
});

test('Arcade: one fighter at an edge and one far away keeps both in view without leaving the world', async ({ page }) => {
  const errors = collectErrors(page);
  await openArcade(page);
  const c = await placeAndSettle(page, 40, 1200);
  const [l, r] = span(c);
  expect(l).toBeGreaterThanOrEqual(-EPS);
  expect(r).toBeLessThanOrEqual(WORLD + EPS);
  expect(l).toBeLessThanOrEqual(40);
  expect(r).toBeGreaterThanOrEqual(1200 + HERO_W);
  expect(errors).toEqual([]);
});

test('Classic: the camera never pans or zooms, wherever the fighters stand', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arenaDemo`);
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 100, 380, 0); a.place(foe.id, 1100, 380, 4); a.step(30); })()`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const c = await camera(page);
  expect(c).toMatchObject({ centerX: 640, zoom: 1, camZoom: 1 });
  expect(c.scrollX).toBeCloseTo(0, 1);
  expect(errors).toEqual([]);
});
