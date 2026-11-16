import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START } from './parity/helpers';

// QA r77 HUD polish: (1) the "WEATHER 0%" chip is not drawn while the charge is empty (it hung over the arena top edge and read as a
// debug box); (2) the two "WINS" captions under the round pips never touch, at any size (they ran together on phones).
// Page-side code is passed as strings (no DOM lib in tsconfig.node). Headless only. Shots go to $SHOT_DIR when set.
const shotDir = process.env['SHOT_DIR'];
const SIZES = [
  { w: 1280, h: 720 },
  { w: 844, h: 390 },
  { w: 667, h: 375 },
  { w: 568, h: 320 },
];

interface HudText {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
}

async function enterFight(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: /^Fight/ }).click();
  await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
  // Past the round intro, so the pips and their captions are drawn.
  await page.evaluate(`window.__TTE__.arena.step(130)`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
}

async function hudAt(page: Page, w: number, h: number): Promise<HudText[]> {
  await page.setViewportSize({ width: w, height: h });
  await enterFight(page);
  if (shotDir) {
    mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: join(shotDir, `hud-polish-${String(w)}x${String(h)}.png`) });
  }
  return page.evaluate<HudText[]>(`window.__TTE__.arena.hudTextSizes()`);
}

for (const { w, h } of SIZES) {
  test(`${String(w)}x${String(h)}: no WEATHER 0% box`, async ({ page }) => {
    const texts = await hudAt(page, w, h);
    expect(texts.filter((t) => t.text.startsWith('WEATHER')).map((t) => t.text), 'an empty weather charge draws nothing').toEqual([]);
  });

  test(`${String(w)}x${String(h)}: the WINS captions have a gap`, async ({ page }) => {
    const texts = await hudAt(page, w, h);
    const wins = texts.filter((t) => t.text === 'WINS').sort((a, b) => a.x - b.x);
    expect(wins, 'one WINS caption per side').toHaveLength(2);
    const [l, r] = wins as [HudText, HudText];
    // The gap between the boxes (x is the origin point; ox says where in the box it sits).
    const gap = r.x - r.w * r.ox - (l.x + l.w * (1 - l.ox));
    expect(gap, `WINS captions ${JSON.stringify(l)} / ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(4);
  });
}
