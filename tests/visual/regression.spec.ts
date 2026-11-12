// Visual regression: toHaveScreenshot for the deterministic subset (DOM screens and stepped arena frames) at 1280x720.
// Baselines live in tests/visual/__baselines__/<platform>/regression/. Linux baselines are the source of truth for CI;
// the whole file is skipped when this platform has none (run `pnpm visual:update` or the "Update visual baselines"
// workflow to create them). Never auto-committed: review the PNGs, then commit. See docs/VISUAL-QA.md.
import { expect, test } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ARENA_READY, CMD, START, STEP, collectErrors, fixture, freeze, goToHash, masks, seedViaGameMaster, startBattle } from './support';

const BASELINES = join(process.cwd(), 'tests', 'visual', '__baselines__', process.platform, 'regression');

// Playwright wants the first argument destructured; no fixture is needed here.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  const have = existsSync(BASELINES) && readdirSync(BASELINES).length > 0;
  testInfo.skip(
    testInfo.config.updateSnapshots === 'none' && !have,
    `no ${process.platform} baselines in tests/visual/__baselines__/ (run pnpm visual:update)`,
  );
});

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

const SCREENS: readonly [string, string][] = [
  ['settings', '#settings'],
  ['objectives', '#currentObjectives'],
  ['wiki', '#wiki'],
  ['key-bindings', '#keyBindings'],
  ['about', '#about'],
  ['garrison', '#garrison'],
];

test('DOM screens match their baselines', async ({ page }) => {
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.goto(`${START}#main`);
  await page.getByRole('heading', { level: 1, name: 'Taming the Elements' }).waitFor();
  await freeze(page);
  await expect(page).toHaveScreenshot('menu.png', { mask: masks(page) });
  for (const [name, hash] of SCREENS) {
    await goToHash(page, hash);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    await freeze(page);
    await expect(page).toHaveScreenshot(`${name}.png`, { mask: masks(page) });
  }
});

test('stepped arena frames match their baselines', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?ff=arenaDemo&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  for (const t of [5, 60, 150]) {
    const now = await page.evaluate<number>(`window.__TTE__.arena.tick`);
    await page.evaluate(`window.__TTE__.arena.step(${String(t - now)})`);
    await expect(page).toHaveScreenshot(`arena-demo-t${String(t).padStart(3, '0')}.png`, { mask: masks(page) });
  }
  expect(errors).toEqual([]);
});

test('scripted human battle frame matches its baseline', async ({ page }) => {
  await seedViaGameMaster(page, fixture('v0-ch4'));
  await startBattle(page, 'enterPracticeContainer', 1);
  await page.evaluate(STEP(60, CMD.right | CMD.primary, CMD.primary));
  await expect(page).toHaveScreenshot('arena-human-t060.png', { mask: masks(page) });
});
