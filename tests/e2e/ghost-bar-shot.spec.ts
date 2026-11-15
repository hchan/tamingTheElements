import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START } from './parity/helpers';

// Life-bar ghost segment (QA r39): a hit drops the bar at once and a pale segment lingers, then drains. Shots to $SHOT_DIR when set.
const shotDir = process.env['SHOT_DIR'];
const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

async function hitFoe(page: Page, two: boolean, beforeHit: () => Promise<void>): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  if (two) {
    await page.getByLabel('Team').selectOption('2');
    await page.getByLabel('Your race').selectOption('sindarosa');
    await page.getByLabel('Your partner (2v2)').selectOption('pax');
    await page.getByLabel('AI race').selectOption('fiara');
  }
  await page.getByRole('button', { name: /^Fight/ }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate('window.__TTE__.arena.step(260)');
  await page.evaluate(`document.querySelector('.firstRunDone')?.click()`);
  const ids = await page.evaluate<number[]>(`(() => { const c = window.__TTE__.arena.characters(); return [c.find((x) => x.team === 0).id, c.find((x) => x.team === 1).id]; })()`);
  const foeHp = (): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.characters().find((c) => c.id === ${String(ids[1])}).hp`);
  await frames(page);
  await beforeHit();
  let landed = false;
  for (const gap of [160, 120, 90, 70, 55]) {
    await page.evaluate(`window.__TTE__.arena.place(${String(ids[0])}, 500, 300, 0); window.__TTE__.arena.place(${String(ids[1])}, ${String(500 + gap)}, 300, 0); window.__TTE__.arena.step(1)`);
    const start = await foeHp();
    for (const cmd of [32, 16]) {
      for (let i = 0; i < 30 && !landed; i++) {
        await page.evaluate(`window.__TTE__.arena.step(1, [${String(cmd)}, 0])`);
        landed = (await foeHp()) < start;
      }
      if (landed) break;
    }
    if (landed) break;
  }
  expect(landed).toBe(true);
  await frames(page);
}

/** Pixels in the foe's life bar band (logical x 700-1160, y 10-30 of the 1280-wide HUD) that are bright ghost yellow, not the dull bar fill. */
async function ghostPixels(page: Page, region = { x: 700, y: 10, w: 460, h: 20 }): Promise<number> {
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const k = box.width / 1280;
  const png = await page.screenshot({ clip: { x: box.x + region.x * k, y: box.y + region.y * k, width: region.w * k, height: region.h * k } });
  return page.evaluate<number>(
    `new Promise((resolve) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        const g = c.getContext('2d');
        g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 215 && d[i + 1] > 170 && d[i + 2] < 150) n++;
        resolve(n);
      };
      im.src = 'data:image/png;base64,${png.toString('base64')}';
    })`,
  );
}

for (const [width, height] of [[1280, 720], [667, 375]] as const) {
  test.describe(`${String(width)}x${String(height)}`, () => {
    test.use({ viewport: { width, height } });
    for (const two of [false, true]) {
      test(`ghost segment after a hit (${two ? '2v2' : '1v1'})`, async ({ page }, info) => {
        await hitFoe(page, two, async () => {
          // Before the hit the bar is a plain fill: no ghost-coloured pixels.
          expect(await ghostPixels(page)).toBe(0);
        });
        const name = `ghost-${two ? '2v2' : '1v1'}-${String(width)}.png`;
        const png = await page.screenshot({ path: shotDir ? `${shotDir}/${name}` : info.outputPath(name) });
        expect(png.length).toBeGreaterThan(2000);
        // Just after the hit the pale segment shows (a sizeable patch even on the phone viewport)...
        expect(await ghostPixels(page)).toBeGreaterThanOrEqual(width < 800 ? 12 : 40);
        // ...and it drains away after the hold.
        await expect.poll(() => ghostPixels(page), { timeout: 20_000 }).toBe(0);
      });
    }
  });
}

// Bench chip ghost: a hero hit and then tagged out keeps its lost-life segment on the mini bar under its bench portrait (team 0, chip 0: x 434-502, y 131).
test('bench chip keeps the ghost trail after a tag-out', async ({ page }, info) => {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Team').selectOption('2');
  await page.getByLabel('Your race').selectOption('sindarosa');
  await page.getByLabel('Your partner (2v2)').selectOption('pax');
  await page.getByLabel('AI race').selectOption('fiara');
  await page.getByRole('button', { name: /^Fight/ }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate('window.__TTE__.arena.step(260)');
  await page.evaluate(`document.querySelector('.firstRunDone')?.click()`);
  const chip = { x: 428, y: 124, w: 80, h: 14 };
  await frames(page);
  expect(await ghostPixels(page, chip)).toBe(0);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const c = a.characters().find((x) => x.team === 0); a.setHp(c.id, Math.round(c.maxHp * 0.5)); })()`);
  await frames(page);
  await page.keyboard.down('Digit3');
  await page.evaluate('window.__TTE__.arena.stepLive(1)');
  await page.keyboard.up('Digit3');
  await frames(page);
  const name = 'ghost-bench-chip.png';
  await page.screenshot({ path: shotDir ? `${shotDir}/${name}` : info.outputPath(name) });
  expect(await ghostPixels(page, chip)).toBeGreaterThanOrEqual(8);
  await expect.poll(() => ghostPixels(page, chip), { timeout: 20_000 }).toBe(0);
});
