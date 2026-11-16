import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Pseudo-3D stun orbit (P3D-2): a stun with no latch gives the reel look, four motes on a tilted ellipse, the far half drawn
// behind the hero and the near half in front. Reduced motion holds still with two and two. SHOT_DIR=<dir> saves a frame strip
// (headless; never needed to pass).

interface Probe {
  readonly heroes: readonly { id: number; kind: string; parts: number; back: number; front: number }[];
  readonly reduced: boolean;
  readonly highContrast: boolean;
}
const INTRO = 91;
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
const place = (page: Page, mx: number, fx: number): Promise<unknown> =>
  page.evaluate(`(() => { const a = window.__TTE__.arena; const [m, f] = a.characters(); a.place(m.id, ${String(mx)}, 360, 0); a.place(f.id, ${String(fx)}, 360, 4); })()`);

/** Pax lays a trap at 600, then the foe is put on it: a stun with no latch. */
async function stunned(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade,cc#arcade`);
  await page.getByLabel('Your race').selectOption('pax');
  await page.getByLabel('AI race').selectOption(process.env['FOE'] ?? 'curomo');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  const card = page.getByRole('button', { name: 'Got it' });
  if (await card.isVisible()) await card.click();
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  await place(page, 600, 1500);
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(TRAP)}, 0])`);
  await page.evaluate(`window.__TTE__.arena.step(90)`);
  await place(page, 1500, 600);
  await page.evaluate(`window.__TTE__.arena.step(8)`);
}

async function reel(page: Page): Promise<Probe['heroes'][number]> {
  const p = await probe(page);
  const h = p.heroes.find((x) => x.kind === 'reel' && x.parts > 0);
  expect(h).toBeDefined();
  return h as Probe['heroes'][number];
}

test('a stun orbits four motes, some behind the head and some in front', async ({ page }) => {
  const errors = collectErrors(page);
  await stunned(page);
  for (let i = 0; i < 12; i++) {
    const h = await reel(page);
    expect(h.parts).toBe(4);
    expect(h.back).toBeGreaterThanOrEqual(1);
    expect(h.front).toBeGreaterThanOrEqual(1);
    expect(h.back + h.front).toBe(4);
    await shot(page, `reel-orbit-${String(i).padStart(2, '0')}`);
    await page.evaluate(`window.__TTE__.arena.step(1)`);
  }
  expect(errors).toEqual([]);
  await page.evaluate(`window.__TTE__.settled()`);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('holds still with two behind and two in front', async ({ page }) => {
    await stunned(page);
    const a = await reel(page);
    await page.evaluate(`window.__TTE__.arena.step(3)`);
    const b = await reel(page);
    expect(a).toMatchObject({ parts: 4, back: 2, front: 2 });
    expect(b).toMatchObject({ parts: 4, back: 2, front: 2 });
    await page.evaluate(`window.__TTE__.settled()`);
  });
});

test.describe('high contrast', () => {
  test.use({ contrast: 'more' });
  test('keeps the near and far split', async ({ page }) => {
    await stunned(page);
    const p = await probe(page);
    expect(p.highContrast).toBe(true);
    const h = await reel(page);
    expect(h.back).toBeGreaterThanOrEqual(1);
    expect(h.front).toBeGreaterThanOrEqual(1);
    await page.evaluate(`window.__TTE__.settled()`);
  });
});
