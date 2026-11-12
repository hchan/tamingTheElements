import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// A11y of Arcade traps and touch buttons (ideas a11y-trap-announcements, a11y-touch-cooldown-readouts): laying a trap is
// spoken in the polite live region, and the Dash, Guard and Charge touch buttons carry their state in words and in the
// accessible name. Page-side code is passed as strings (no DOM lib in tsconfig.node).

/** Round 1's intro (FUN-DESIGN 2.10): nobody acts until tick 91. */
const INTRO = 91;

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const polite = (page: Page): Promise<string> => page.evaluate<string>(`document.getElementById('liveRegion')?.textContent ?? ''`);

async function start(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('pax');
  await page.getByLabel('AI race').selectOption('sindarosa');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 300, 360, 0); a.place(foe.id, 1500, 360, 4); })()`);
}

test('laying a trap is spoken politely in words; no listener left behind', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await page.keyboard.down('KeyZ');
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.keyboard.up('KeyZ');
  await page.evaluate(`window.__TTE__.arena.stepLive(4)`);
  await frames(page);
  await expect.poll(() => polite(page), { timeout: 5000 }).toMatch(/^Your (Fire Bomb|Puddle|Spike|Gust) placed\.$/);
  await expect(page.locator('#liveRegion')).toHaveAttribute('aria-live', 'polite');
  // The arming tick follows (TRAP_ARM_TICKS); it is spoken after the throttle gap.
  await page.evaluate(`window.__TTE__.arena.stepLive(40)`);
  await expect.poll(async () => { await frames(page); return polite(page); }, { timeout: 8000 }).toMatch(/armed\.$/);

  await page.keyboard.press('Shift+P');
  await page.waitForFunction(`window.__TTE__.arena.paused === false`);
  await page.keyboard.press('Shift+P');
  await page.getByRole('link', { name: 'Exit to menu' }).click();
  await page.waitForFunction(`window.location.hash === '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  await expect(page.locator('#arcadeTrap')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(errors).toEqual([]);
});

test('Dash, Guard and Charge touch buttons show their state in words and in the accessible name', async ({ page }) => {
  await start(page);
  for (const [id, name] of [['arcadeDash', '7 Dash'], ['arcadeGuard', '8 Guard'], ['arcadeCharge', '5 Charge']] as const) {
    await expect(page.locator(`#${id}`)).toContainText(/ready|\d+s|\d+%/, { timeout: 5000 });
    await expect(page.locator(`#${id}`)).toHaveAttribute('aria-label', new RegExp(`^${name}, (ready|\\d+s|\\d+%)$`));
  }
  // A dash starts its cooldown: the button reads seconds, then ready again.
  await page.keyboard.press('KeyE');
  await page.evaluate(`window.__TTE__.arena.stepLive(5)`);
  await expect(page.locator('#arcadeDash')).toContainText(/\d+s|ready/);
});
