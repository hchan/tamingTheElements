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
    // QA r79: 6 px at 568x320 still read as "WINS WINS"; the gap holds at a clear 10 px (screen) on every size.
    expect(gap, 'a clear gap, not just not-touching').toBeGreaterThanOrEqual(10);
  });
}

// QA r79: on a phone the fullscreen toggle sits under the HUD band (top right), where the foe's hit counter is; "3 HITS / 66 DMG" read as
// "3 / 66". The counter now keeps clear of the toggle. Needs a coarse pointer (the phone placement) and an AI foe that hits us (Versus).
test.describe('568x320 touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 568, height: 320 } });

  test('the hit counter does not sit under the fullscreen toggle', async ({ page }) => {
    test.setTimeout(180_000); // up to 80 step + screenshot rounds on the mobile profile
    await page.goto(`/?manual=1&seed=11&ff=arcade#versus`);
    await page.getByRole('button', { name: 'Fight!' }).tap();
    await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
    await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(95); const [me, foe] = a.characters(); a.place(me.id, 500, 360, 0); a.place(foe.id, 640, 360, 4); })()`);
    // Hit until a counter shows (the player's lands on the left; the foe's AI counter-hits land on the right).
    let shown: HudText[] = [];
    for (let i = 0; i < 80 && shown.length === 0; i++) {
      await page.evaluate(`window.__TTE__.arena.step(1, [${String(i % 3 ? 16 : 32)}, 0])`);
      await page.evaluate(`window.__TTE__.arena.stepLive(8)`);
      await page.screenshot(); // a frame must render before the HUD's texts reflect the sim (rAF does not fire reliably on the mobile profile)
      shown = (await page.evaluate<HudText[]>(`window.__TTE__.arena.hudTextSizes()`)).filter((t) => /HITS/.test(t.text) && t.ox === 1);
    }
    expect(shown.length, 'a right-hand hit counter showed').toBeGreaterThan(0);
    const toggle = await page.evaluate<{ left: number; top: number; right: number; bottom: number }>(`document.getElementById('fullscreenToggle').getBoundingClientRect().toJSON()`);
    if (shotDir) {
      mkdirSync(shotDir, { recursive: true });
      await page.screenshot({ path: join(shotDir, 'hit-counter-568x320.png') });
    }
    for (const c of shown) {
      const right = c.x; // origin 1: x is the right edge
      const top = c.y;
      const overlaps = right > toggle.left && c.x - c.w < toggle.right && top < toggle.bottom && top + c.h > toggle.top;
      expect(overlaps, `counter ${JSON.stringify(c)} vs toggle ${JSON.stringify(toggle)}`).toBe(false);
    }
  });
});
