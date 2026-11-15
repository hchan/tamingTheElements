import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START } from './parity/helpers';

// Life-bar ghost segment (QA r39): a hit drops the bar at once and a pale segment lingers, then drains. Shots to $SHOT_DIR when set.
const shotDir = process.env['SHOT_DIR'];
const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

async function hitFoe(page: Page, two: boolean): Promise<void> {
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

for (const [width, height] of [[1280, 720], [667, 375]] as const) {
  test.describe(`${String(width)}x${String(height)}`, () => {
    test.use({ viewport: { width, height } });
    for (const two of [false, true]) {
      test(`ghost segment after a hit (${two ? '2v2' : '1v1'})`, async ({ page }, info) => {
        await hitFoe(page, two);
        const name = `ghost-${two ? '2v2' : '1v1'}-${String(width)}.png`;
        const png = await page.screenshot({ path: shotDir ? `${shotDir}/${name}` : info.outputPath(name) });
        expect(png.length).toBeGreaterThan(2000);
      });
    }
  });
}
