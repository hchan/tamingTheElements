// Short WebM recordings (Playwright video, 1280x720) of a stepped bot-vs-bot battle and a keyboard-driven human-style battle.
// Saved to test-results/visual/*.webm. Stepping once per animation frame keeps the footage deterministic in content
// (only the playback speed follows the machine).
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ARENA_READY, OUT_DIR, collectErrors, fixture, seedViaGameMaster, startBattle } from './support';

test.use({ viewport: { width: 1280, height: 720 }, video: { mode: 'on', size: { width: 1280, height: 720 } } });

/** Runs `call` page-side once per animation frame for `frames` frames. */
const FRAME_LOOP = (frames: number, call: string): string => `new Promise((resolve) => {
  let i = 0;
  const tick = () => {
    ${call};
    i++;
    if (i < ${String(frames)}) requestAnimationFrame(tick); else resolve(i);
  };
  requestAnimationFrame(tick);
})`;

test('video: stepped bot-vs-bot battle', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?ff=arenaDemo&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(FRAME_LOOP(420, 'window.__TTE__.arena.step(1)'));
  expect(errors).toEqual([]);
  mkdirSync(OUT_DIR, { recursive: true });
  const video = page.video();
  await page.close();
  await video?.saveAs(join(OUT_DIR, 'battle-bot-vs-bot.webm'));
});

test('video: keyboard-driven human-style battle', async ({ page }) => {
  const errors = collectErrors(page);
  await seedViaGameMaster(page, fixture('v0-ch4'));
  await startBattle(page, 'enterPracticeContainer', 1);
  const run = (frames: number): Promise<unknown> => page.evaluate(FRAME_LOOP(frames, 'window.__TTE__.arena.stepLive(1)'));
  // Walk right firing the primary ability, back off up-left firing the secondary, then stand and fire both.
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('Space');
  await run(90);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('Enter');
  await run(90);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await run(80);
  await page.keyboard.up('ArrowLeft');
  await run(80);
  await page.keyboard.up('Space');
  await page.keyboard.up('Enter');
  expect(errors).toEqual([]);
  mkdirSync(OUT_DIR, { recursive: true });
  const video = page.video();
  await page.close();
  await video?.saveAs(join(OUT_DIR, 'battle-keyboard-human.webm'));
});
