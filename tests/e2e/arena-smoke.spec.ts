import { expect, test, type Page } from '@playwright/test';

// Page-side code is passed as strings because tsconfig.node has no DOM lib.
const ARENA_READY = `window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena`;
const CHARS = `window.__TTE__.arena.characters()`;
const RIGHT = 8;

interface Ch {
  id: number;
  team: number;
  x: number;
  y: number;
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || /has no frame|missing frame/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openArena(page: Page): Promise<void> {
  await page.goto('/?ff=arenaDemo&manual=1');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
}

/** Opens a fresh arena (same seed), steps 100 ticks with the given commands, returns [hash before, hash after]. */
async function runOnce(page: Page, cmds: [number, number]): Promise<[number, number]> {
  await openArena(page);
  const before = await page.evaluate<number>(`window.__TTE__.arena.hash()`);
  await page.evaluate(`window.__TTE__.arena.step(100, ${JSON.stringify(cmds)})`);
  const after = await page.evaluate<number>(`window.__TTE__.arena.hash()`);
  return [before, after];
}

test('arena renders two finite-positioned characters and steps deterministically', async ({ page }) => {
  const errors = collectErrors(page);
  await openArena(page);

  const chars = await page.evaluate<Ch[]>(CHARS);
  expect(chars).toHaveLength(2);
  for (const c of chars) {
    expect(Number.isFinite(c.x)).toBe(true);
    expect(Number.isFinite(c.y)).toBe(true);
  }
  const canvas = await page.locator('#game canvas').boundingBox();
  expect(canvas?.width).toBeGreaterThan(0);

  const first = await runOnce(page, [RIGHT, 0]);
  expect(first[1]).not.toBe(first[0]);
  const moved = await page.evaluate<Ch[]>(CHARS);
  const p1Before = chars.find((c) => c.team === 0);
  const p1After = moved.find((c) => c.team === 0);
  expect(p1After?.x).not.toBe(p1Before?.x);

  const second = await runOnce(page, [RIGHT, 0]);
  expect(second).toEqual(first);

  const other = await runOnce(page, [0, 0]);
  expect(other[1]).not.toBe(first[1]);

  expect(errors).toEqual([]);
});

test('forceNoWebgl shows the error screen', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?ff=forceNoWebgl');
  await expect(page.getByRole('alert')).toContainText('WebGL is required');
  await expect(page.locator('#game canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
