import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Crowd-control overlay (idea crowd-control-animations, CA4): a Puddle gives the mired look, a stun of 40+ ticks gives motes,
// a Classic Tornado release cracks, reduced motion paints equal parts across two steps. SHOT_DIR=<dir> saves screenshots
// (headless; never needed to pass). Page-side code is passed as strings (no DOM lib in tsconfig.node).

interface Probe {
  readonly heroes: readonly { id: number; kind: string; release: string; parts: number; segs: number; age: number }[];
  readonly parts: number;
  readonly segs: number;
  readonly cracks: number;
  readonly started: { ring: number; crack: number; puff: number; denied: number };
  readonly reduced: boolean;
}
const INTRO = 91;
const PRIMARY = 16;
const TRAP = 64; // Cmd.trap = 1 << 6
const SHOT_DIR = process.env['SHOT_DIR'];

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const probe = async (page: Page): Promise<Probe> => {
  await frames(page);
  const p = await page.evaluate<Probe | undefined>(`window.__TTE__.arena.ccFx()`);
  expect(p).toBeDefined();
  return p as Probe;
};
const shot = async (page: Page, name: string): Promise<void> => {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.locator('#game canvas').screenshot({ path: `${SHOT_DIR}/${name}.png` });
};

async function arcade(page: Page, me: string, foe: string, flags = "arcade,cc"): Promise<void> {
  await page.goto(`${START}&ff=${flags}#arcade`);
  await page.getByLabel('Your race').selectOption(me);
  await page.getByLabel('AI race').selectOption(foe);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  const card = page.getByRole('button', { name: 'Got it' });
  if (await card.isVisible()) await card.click();
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
}
const place = (page: Page, mx: number, fx: number): Promise<unknown> =>
  page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, ${String(mx)}, 360, 0); a.place(f.id, ${String(fx)}, 360, 4); })()`);

/** Lays a Puddle where the hero stands (600), arms it, then puts the foe on it. */
async function puddle(page: Page): Promise<void> {
  await arcade(page, 'curomo', 'pax');
  await place(page, 600, 1500);
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(TRAP)}, 0])`);
  await page.evaluate(`window.__TTE__.arena.step(90)`);
  await place(page, 1500, 600);
  await page.evaluate(`window.__TTE__.arena.step(8)`);
}

test('a Puddle under the foe gives the mired look', async ({ page }) => {
  const errors = collectErrors(page);
  await puddle(page);
  const p = await probe(page);
  expect(p.heroes.some((h) => h.kind === 'mired' && h.parts > 0)).toBe(true);
  await shot(page, 'mired');
  expect(errors).toEqual([]);
  await page.evaluate(`window.__TTE__.settled()`);
});

test('a stun of 40 or more ticks gives a look (Tornado: gust bands)', async ({ page }) => {
  const errors = collectErrors(page);
  await arcade(page, 'cyclonius', 'pax', 'arcade');
  await place(page, 300, 520);
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(PRIMARY)}, 0])`);
  let seen = 0;
  for (let i = 0; i < 90 && seen === 0; i++) {
    await page.evaluate(`window.__TTE__.arena.step(1)`);
    const p = await probe(page);
    seen = p.heroes.filter((h) => h.kind !== 'none' && h.parts + h.segs > 0).length;
  }
  expect(seen).toBeGreaterThan(0);
  await shot(page, 'stun');
  expect(errors).toEqual([]);
  await page.evaluate(`window.__TTE__.settled()`);
});

test('a Classic Tornado hit cracks when the freeze lets go', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?ff=arenaDemo&manual=1&seed=7&p1=cyclonius');
  await page.waitForFunction(ARENA_READY);
  await place(page, 100, 520);
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(PRIMARY)}, 0])`);
  let cracked = 0;
  for (let i = 0; i < 400 && cracked === 0; i++) {
    await page.evaluate(`window.__TTE__.arena.step(2)`);
    cracked = (await probe(page)).started.crack;
  }
  expect(cracked).toBeGreaterThan(0);
  await shot(page, 'crack');
  expect(errors).toEqual([]);
  await page.evaluate(`window.__TTE__.settled()`);
});

test('reduced motion paints the same parts across two steps', async ({ page }) => {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await puddle(page);
  const a = await probe(page);
  await page.evaluate(`window.__TTE__.arena.step(2)`);
  const b = await probe(page);
  expect(a.reduced).toBe(true);
  expect(a.parts).toBeGreaterThan(0);
  expect(b.parts).toBe(a.parts);
  expect(b.segs).toBe(a.segs);
  expect(errors).toEqual([]);
  await page.evaluate(`window.__TTE__.settled()`);
});
