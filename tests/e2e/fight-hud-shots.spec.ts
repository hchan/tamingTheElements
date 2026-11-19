import { test, type Page } from '@playwright/test';
import { ARENA_READY, START } from './parity/helpers';

// Desktop fight HUD shots (1v1 and 2v2 at 1280x720). Shots go to $SHOT_DIR when set (before/after review).
const shotDir = process.env['SHOT_DIR'];

async function enterFight(page: Page, team = 1): Promise<void> {
  // The first-run card times itself out on a wall-clock setTimeout(2500) from arena create. On a loaded machine the layout reads,
  // shots and the tap can take longer than that: the card is then already faded (pointer-events none) and the Got it tap never lands.
  // Stretch only that one timer so these tests see the card until they are done (the timeout itself is covered in first-run-hint.dom.test.ts).
  await page.addInitScript(`(() => {
    const real = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...a) => real(fn, ms === 2500 ? 600000 : ms, ...a);
  })()`);
  await page.goto(`${START}&ff=arcade#arcade`);
  if (team === 2) {
    await page.getByLabel('Team').selectOption('2');
    await page.getByLabel('Your race').selectOption('sindarosa');
    await page.getByLabel('Your partner (2v2)').selectOption('pax');
    await page.getByLabel('AI race').selectOption('fiara');
  }
  await page.getByRole('button', { name: /^Fight/ }).click();
  await page.waitForFunction(ARENA_READY, undefined, { timeout: 90_000 });
  // The card is held back until ROUND 1 / FIGHT! has cleared (FIGHT_OVER_EVENT, QA r34/r35). START boots with manual=1, so the sim is
  // paused: step it past the intro (about 95 ticks) instead of waiting on the 7 s wall-clock fallback, then wait for the reveal.
  await page.evaluate(`window.__TTE__.arena.step(110)`);
  await page.locator('#firstRunHint:not(.firstRunWait)').waitFor({ state: 'attached', timeout: 90_000 });
}

async function shot(page: Page, name: string): Promise<void> {
  if (shotDir) await page.screenshot({ path: `${shotDir}/${name}.png` });
}

test.describe('desktop fight HUD shots', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  for (const team of [1, 2]) {
    test(`${String(team)}v${String(team)} HUD`, async ({ page }) => {
      await enterFight(page, team);
      await page.evaluate(`window.__TTE__.arena.step(120)`);
      await shot(page, `desk-${String(team)}v${String(team)}-hud`);
    });
  }
});
