import { expect, test } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Redrawn map effect strips (tools/assets/fx-gen/batch-e-map.py): a real headless match with Cyclonius casting Tornado
// (primary) loads the generated img/fx/tornado.png instead of the legacy img/map/tornado.png, draws it without page errors,
// and the arena screenshot is nonblank. Page-side code is passed as strings (tsconfig.node has no DOM lib).
test('Tornado is drawn from the redrawn fx strip, not the legacy map PNG', async ({ page }, info) => {
  const errors: string[] = [];
  const loaded: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (/\/img\/(fx|map)\/tornado\.png/.test(r.url())) loaded.push(`${String(r.status())} ${r.url().replace(/^.*\/assets\//, '')}`); });
  await page.goto('/?ff=arenaDemo&manual=1&seed=7&p1=cyclonius');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`(() => {
    const a = window.__TTE__.arena;
    const [me, foe] = a.characters();
    a.place(me.id, 100, 380, 0);
    a.place(foe.id, 520, 380, 4);
  })()`);
  await page.evaluate('window.__TTE__.arena.step(1, [16, 0])');
  for (let i = 0; i < 12; i++) await page.evaluate('window.__TTE__.arena.step(1, [0, 0])');
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const shot = await page.locator('#game canvas').screenshot({ path: info.outputPath('tornado-in-arena.png') });
  expect(shot.length).toBeGreaterThan(2000);
  expect(loaded).toEqual(['200 img/fx/tornado.png']);
  expect(errors).toEqual([]);
});
