import { test } from '@playwright/test';
import { ARENA_READY, START, characters } from './parity/helpers';
const tag = process.env['SHOT_TAG'] ?? 'shot';
test('r125 shot', async ({ page }, testInfo) => {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Team').selectOption('2');
  await page.getByLabel('Your race').selectOption('sindarosa');
  await page.getByLabel('Your partner (2v2)').selectOption('pax');
  await page.getByLabel('AI race').selectOption('fiara');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(91)`);
  const first = (await characters(page, 0))[0]?.id;
  let done = false;
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 400 && !done; i++) {
    const cs = await characters(page);
    const a = cs.find((c) => c.team === 0), b = cs.find((c) => c.team === 1);
    const gap = a && b ? Math.abs(b.x - a.x) - (a.w + b.w) / 2 : 9999;
    if (gap < 60) {
      await page.keyboard.up('ArrowRight');
      await page.keyboard.down('Digit3');
      await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
      await page.keyboard.up('Digit3');
      done = (await characters(page, 0))[0]?.id !== first;
      console.log('tag try', i, gap, done);
      if (!done) await page.keyboard.down('ArrowRight');
    }
    if (!done) await page.evaluate(`window.__TTE__.arena.stepLive(2)`);
  }
  for (const n of [1, 3, 6, 12]) {
    await page.evaluate(`window.__TTE__.arena.stepLive(${String(n)})`);
    await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const cs = await characters(page);
    console.log('after', n, JSON.stringify(cs.map((c) => [c.team, c.x, c.y, c.w])));
    await page.screenshot({ path: testInfo.outputPath(`${tag}-${String(n)}.png`) });
  }
});
