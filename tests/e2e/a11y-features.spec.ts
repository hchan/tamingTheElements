import { expect, test, type Page } from '@playwright/test';
import {
  ARENA_READY,
  characters,
  collectErrors,
  fixture,
  goToHash,
  killEnemy,
  seedViaGameMaster,
  START,
  startBattle,
  storedSave,
} from './parity/helpers';

// Page-side code is passed as strings because tsconfig.node has no DOM lib.
const REDUCE = `document.documentElement.dataset.reduceMotion`;
const CONTRAST = `document.documentElement.dataset.highContrast`;
/** Primary plus secondary ability: Fire Heal alone hurts nobody, the Fireball does. */
const ATTACK = 48;
const CAPTURE = 64;

async function saveSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(`window.__TTE__.state().mountedRoute === '#main'`);
}

test.describe('reduce motion follows the OS by default', () => {
  test.use({ reducedMotion: 'reduce' });

  test('on by default, can be switched off, and the choice persists in the save', async ({ page }) => {
    await page.goto(START);
    expect(await page.evaluate<string>(REDUCE)).toBe('true');
    await goToHash(page, '#settings');
    const box = page.getByLabel('Reduce motion');
    await expect(box).toBeChecked();
    await box.uncheck();
    await saveSettings(page);
    expect(await page.evaluate<string>(REDUCE)).toBe('false');
    expect(await storedSave(page)).toMatchObject({ reduceMotion: false });
    await page.reload();
    expect(await page.evaluate<string>(REDUCE)).toBe('false');
    await goToHash(page, '#settings');
    await expect(page.getByLabel('Reduce motion')).not.toBeChecked();
  });

  test('leaving the box as the OS default stores nothing', async ({ page }) => {
    await page.goto(START);
    await goToHash(page, '#settings');
    await saveSettings(page);
    expect('reduceMotion' in (await storedSave(page))).toBe(false);
    expect(await page.evaluate<string>(REDUCE)).toBe('true');
  });
});

test.describe('reduce motion opt-in without an OS preference', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('off by default; Settings turns it on and a reload keeps it', async ({ page }) => {
    await page.goto(START);
    expect(await page.evaluate<string>(REDUCE)).toBe('false');
    await goToHash(page, '#settings');
    await page.getByLabel('Reduce motion').check();
    await saveSettings(page);
    expect(await storedSave(page)).toMatchObject({ reduceMotion: true });
    await page.reload();
    expect(await page.evaluate<string>(REDUCE)).toBe('true');
  });

  async function hitAndSeeShake(page: Page): Promise<{ damaged: boolean; shook: boolean }> {
    await seedViaGameMaster(page, fixture('v0-ch2'));
    await startBattle(page, 'enterBattlegroundContainer');
    const [hero] = await characters(page, 0);
    const [enemy] = await characters(page, 1);
    // Both sides use their abilities on each other until someone is hurt.
    return page.evaluate<{ damaged: boolean; shook: boolean }>(
      `(() => {
        const a = window.__TTE__.arena;
        a.place(${String(hero?.id)}, 300, 300, 0);
        a.place(${String(enemy?.id)}, 420, 300, 4);
        const total = () => a.characters().reduce((n, c) => n + c.hp, 0);
        const before = total();
        for (let i = 0; i < 400; i++) {
          a.step(1, [${String(ATTACK)}, ${String(ATTACK)}]);
          if (total() < before) return { damaged: true, shook: a.shaking() };
        }
        return { damaged: false, shook: false };
      })()`,
    );
  }

  test('a hit shakes the screen normally', async ({ page }) => {
    const r = await hitAndSeeShake(page);
    expect(r.damaged).toBe(true);
    expect(r.shook).toBe(true);
  });

  test('a hit does not shake the screen once Reduce motion is on', async ({ page }) => {
    await page.goto(START);
    await goToHash(page, '#settings');
    await page.getByLabel('Reduce motion').check();
    await saveSettings(page);
    const r = await hitAndSeeShake(page);
    expect(r.damaged).toBe(true);
    expect(r.shook).toBe(false);
  });
});

test.describe('high contrast', () => {
  test.use({ contrast: 'more' });

  test('follows prefers-contrast by default and can be switched off', async ({ page }) => {
    await page.goto(START);
    expect(await page.evaluate<string>(CONTRAST)).toBe('true');
    await goToHash(page, '#settings');
    await page.getByLabel('High contrast').uncheck();
    await saveSettings(page);
    expect(await page.evaluate<string>(CONTRAST)).toBe('false');
    expect(await storedSave(page)).toMatchObject({ highContrast: false });
  });
});

test.describe('key rebinding', () => {
  test('rebind, detect a conflict, persist, reach the battle, then reset', async ({ page }) => {
    await seedViaGameMaster(page, fixture('v0-ch3'));
    await goToHash(page, '#keyBindings');
    const status = page.getByRole('status');

    // A free key rebinds the Capture action and is saved.
    await page.locator('#bind-capture-0').click();
    await expect(page.locator('#bind-capture-0')).toHaveText('Press a key...');
    await page.keyboard.press('KeyV');
    await expect(page.locator('#bind-capture-0')).toHaveText('V');
    await expect(status).toContainText('Capture is now V');
    await expect.poll(async () => (await storedSave(page)).keyBindings?.['capture']).toEqual(['KeyV']);

    // A key owned by another action is a conflict: nothing changes until the player confirms.
    await page.locator('#bind-capture-1').click();
    await page.keyboard.press('KeyW');
    await expect(status).toContainText('W is already used by Move Up');
    expect((await storedSave(page)).keyBindings?.['up']).toEqual(['ArrowUp', 'KeyW']);
    await page.getByRole('button', { name: 'Move W to Capture' }).click();
    await expect(page.locator('#bind-capture-1')).toHaveText('W');
    await expect
      .poll(async () => (await storedSave(page)).keyBindings)
      .toMatchObject({ capture: ['KeyV', 'KeyW'], up: ['ArrowUp'] });

    // Reserved keys are refused, Escape cancels.
    await page.locator('#bind-slot3-0').click();
    await page.keyboard.press('Tab');
    await expect(page.locator('#bind-slot3-0')).toHaveText('3');
    await page.locator('#bind-slot3-0').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#bind-slot3-0')).toHaveText('3');
    await page.waitForFunction(`window.__TTE__.state().mountedRoute === '#keyBindings'`);

    // The battle uses the saved bindings.
    await page.goto('/?seed=7');
    await startBattleFromMenu(page);
    expect(await page.evaluate<Record<string, string[]>>(`window.__TTE__.arena.boundCodes()`)).toMatchObject({
      capture: ['KeyV', 'KeyW'],
      up: ['ArrowUp'],
    });

    // Reset to defaults removes the field again.
    await goToHash(page, '#keyBindings');
    await page.locator('#resetBindings').click();
    await expect(page.locator('#bind-capture-0')).toHaveText('C');
    await expect.poll(async () => 'keyBindings' in (await storedSave(page))).toBe(false);
  });

  async function startBattleFromMenu(page: Page): Promise<void> {
    await page.evaluate(`window.location.hash = '#garrison'`);
    await page.locator('#garrisonTable .garrisonRow').first().click();
    await page.locator('#enterPracticeContainer').click();
    await page.waitForFunction(ARENA_READY);
  }
});

test.describe('gamepad', () => {
  test('Start on a gamepad opens and closes the pause dialog', async ({ page }) => {
    await page.addInitScript(`
      window.__padStart = false;
      navigator.getGamepads = () => [{
        connected: true,
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 9 && window.__padStart, value: 0 })),
      }];
    `);
    await seedViaGameMaster(page, fixture('v0-ch3'));
    // A real-time (not manual) battle, so Start pauses rather than resumes.
    await page.goto('/?seed=7');
    await startBattle(page, 'enterPracticeContainer');
    const dialog = page.getByRole('dialog', { name: 'Paused' });
    await page.evaluate(`window.__padStart = true`);
    await expect(dialog).toBeVisible();
    // Release Start for a few frames, then press it again.
    await page.evaluate(
      `(async () => {
        window.__padStart = false;
        for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
        window.__padStart = true;
      })()`,
    );
    await expect(dialog).toBeHidden();
  });
});

test.describe('screen reader announcements', () => {
  test('match start, low health, capture and win are announced', async ({ page }) => {
    const errors = collectErrors(page);
    await seedViaGameMaster(page, fixture('v0-ch3'));
    await startBattle(page, 'enterPracticeContainer');
    const assertive = page.locator('#liveRegionAssertive');
    const polite = page.locator('#liveRegion');
    await expect(assertive).toHaveAttribute('role', 'alert');
    await expect(polite).toHaveAttribute('aria-live', 'polite');
    await expect(assertive).toContainText('Match started');

    const [hero] = await characters(page, 0);
    await page.evaluate(`window.__TTE__.arena.setHp(${String(hero?.id)}, ${String((hero?.maxHp ?? 0) * 0.2)})`);
    await expect(polite).toContainText('Low health');

    await killEnemy(page);
    await expect(assertive).toContainText('Victory');
    expect(errors).toEqual([]);
  });

  test('a capture is announced together with the result', async ({ page }) => {
    await seedViaGameMaster(page, fixture('v0-ch2'));
    await startBattle(page, 'enterBattlegroundContainer');
    const [hero] = await characters(page, 0);
    const [enemy] = await characters(page, 1);
    await page.evaluate(
      `const a = window.__TTE__.arena;
       a.place(${String(hero?.id)}, 300, 300, 0);
       a.place(${String(enemy?.id)}, 420, 300, 0);
       a.setHp(${String(enemy?.id)}, ${String((enemy?.maxHp ?? 0) * 0.2)});
       a.step(1, [${String(CAPTURE)}, 0]);
       a.step(60, [0, 0]);`,
    );
    // Polite when the throttle allows it, otherwise folded into the assertive result line.
    await expect
      .poll(() =>
        page.evaluate<string>(
          `document.getElementById('liveRegion').textContent + document.getElementById('liveRegionAssertive').textContent`,
        ),
      )
      .toContain('Captured the opponent');
  });

  test('defeat is announced', async ({ page }) => {
    await seedViaGameMaster(page, fixture('v0-ch3'));
    await startBattle(page, 'enterPracticeContainer');
    const [hero] = await characters(page, 0);
    await page.evaluate(`window.__TTE__.arena.setHp(${String(hero?.id)}, 0); window.__TTE__.arena.step(1)`);
    await expect(page.locator('#liveRegionAssertive')).toContainText('Defeat');
  });
});
