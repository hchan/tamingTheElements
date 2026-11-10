import { expect, test } from '@playwright/test';
import {
  BACKUP_KEY,
  CINEMATIC_READY,
  START,
  characters,
  collectErrors,
  fixture,
  fixtureText,
  goToHash,
  killEnemy,
  leaveBattle,
  newGameToGarrison,
  skipCinematic,
  seedViaGameMaster,
  startBattle,
  storedSave,
  waitForRoute,
} from './helpers';

const BATTLE = 'enterBattlegroundContainer';
const PRACTICE = 'enterPracticeContainer';
const PORTAL = 'enterPortalContainer';
const CAPTURE = 64; // Cmd.capture

test.describe('parity golden paths', () => {
  test('1. empty storage -> New Game -> garrison has 1 character in chapter 1 (no capture yet)', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(START);
    await newGameToGarrison(page);
    await expect(page.locator('#garrisonTable .garrisonRow')).toHaveCount(1);
    const save = await storedSave(page);
    expect(save.chapter).toBe(1);
    expect(save.garrison).toHaveLength(1);

    await startBattle(page, PRACTICE);
    expect(await page.evaluate<boolean>(`window.__TTE__.arena.captureGranted()`)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('1b. New Game -> intro cinematic -> Skip -> garrison', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(START);
    await page.getByText('New Game', { exact: true }).click();
    await page.waitForFunction(CINEMATIC_READY);
    expect(await page.evaluate<string>(`window.__TTE__.state().route`)).toBe('#newGame');
    // Legacy writes the save when the story ends, so nothing is stored while it plays.
    expect(await page.evaluate<string | null>(`window.localStorage.getItem('Taming the Elements')`)).toBeNull();
    expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBeGreaterThan(0);

    await skipCinematic(page);
    await waitForRoute(page, '#garrison');
    await page.evaluate(`window.__TTE__.settled()`);
    await expect(page.locator('#garrisonTable .garrisonRow')).toHaveCount(1);
    await expect(page.locator('#game canvas')).toHaveCount(0);
    expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
    const save = await storedSave(page);
    expect(save.chapter).toBe(1);
    expect(save.garrison).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('1c. Story Mode plays the story; Skip returns to the main menu and writes no save', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(START);
    await page.getByText('Story Mode', { exact: true }).click();
    await skipCinematic(page);
    await waitForRoute(page, '#main');
    await page.evaluate(`window.__TTE__.settled()`);
    await expect(page.locator('#game canvas')).toHaveCount(0);
    expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
    expect(await page.evaluate<string | null>(`window.localStorage.getItem('Taming the Elements')`)).toBeNull();
    expect(errors).toEqual([]);
  });

  test('9b. game master presets: chapter 3 has no portal; chapter complete shows it and enters the Eternal Void', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto(START + '#gameMaster');
    await page.getByText('Chapter 3', { exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Chapter 3 preset written.');
    await goToHash(page, '#garrison');
    await expect(page.locator('#' + PORTAL)).toHaveCount(0);

    await goToHash(page, '#gameMaster');
    await page.getByText('Chapter complete', { exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Chapter complete preset written.');
    await goToHash(page, '#garrison');
    await expect(page.locator('#' + PORTAL)).toBeVisible();
    await expect(page.locator('#' + PORTAL + ' canvas')).toHaveCount(1);
    await page.locator('#' + PORTAL).hover();

    // Fewer than three heroes selected: the legacy alert, no battle.
    let alert = '';
    page.once('dialog', (d) => {
      alert = d.message();
      void d.dismiss();
    });
    await page.locator('#' + PORTAL).click();
    expect(alert).toContain('You must select 3 heroes');
    expect(await page.evaluate<string>(`window.__TTE__.state().route`)).toBe('#garrison');

    await startBattle(page, PORTAL, 3);
    expect(await characters(page, 0)).toHaveLength(1);
    const foes = await characters(page, 1);
    expect(foes).toHaveLength(1);
    // The boss alone: Eternal Void is the only opponent, at the chapter cap.
    expect(foes[0]?.maxHp).toBeGreaterThan(0);
    await leaveBattle(page);
    expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('2. chapter-1 battle won -> Victory shows XP -> garrison XP updates and persists across reload', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto(START);
    await newGameToGarrison(page);
    await expect(page.locator('#garrisonTable .garrisonRow')).toHaveCount(1);
    expect(await storedSave(page)).toMatchObject({ garrison: [{ experience: 1 }] });

    await startBattle(page, BATTLE);
    await killEnemy(page);
    await waitForRoute(page, '#victory');
    await expect(page.getByText('Victory!')).toBeVisible();
    await expect(page.getByText(/gained 1 XP/)).toBeVisible();

    await page.getByText('Garrison', { exact: true }).click();
    await expect(page.locator('#garrisonTable .garrisonRow')).toContainText('XP 2');
    await page.reload();
    await expect(page.locator('#garrisonTable .garrisonRow')).toContainText('XP 2');
    expect((await storedSave(page)).garrison[0]?.experience).toBe(2);
    expect(errors).toEqual([]);
  });

  test('3. 4 XP -> win -> objectives met -> chapter 2, where capture is available', async ({ page }) => {
    const errors = collectErrors(page);
    const save = fixture('v0-new-game');
    (save.garrison[0] as { experience: number }).experience = 4;
    await seedViaGameMaster(page, save);

    await startBattle(page, BATTLE);
    await killEnemy(page);
    await waitForRoute(page, '#victory');
    await expect(page.getByText(/gained 1 XP.*Level up! 4 to 5/)).toBeVisible();

    await page.getByText('Current Objectives', { exact: true }).click();
    await page.getByRole('button', { name: 'Begin next chapter' }).click();
    await waitForRoute(page, '#garrison');
    await expect.poll(async () => (await storedSave(page)).chapter).toBe(2);

    await startBattle(page, BATTLE);
    expect(await page.evaluate<boolean>(`window.__TTE__.arena.captureGranted()`)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('4. enemy at <=25% HP + capture command -> enemy joins the garrison', async ({ page }) => {
    const errors = collectErrors(page);
    const save = fixture('v0-ch2');
    await seedViaGameMaster(page, save);

    await startBattle(page, BATTLE);
    const [hero] = await characters(page, 0);
    const [enemy] = await characters(page, 1);
    expect(hero && enemy).toBeTruthy();
    await page.evaluate(
      `const a = window.__TTE__.arena;
       a.place(${String(hero?.id)}, 300, 300, 0);
       a.place(${String(enemy?.id)}, 420, 300, 0);
       a.setHp(${String(enemy?.id)}, ${String((enemy?.maxHp ?? 0) * 0.2)});
       a.step(1, [${String(CAPTURE)}, 0]);
       a.step(60, [0, 0]);`,
    );
    await waitForRoute(page, '#victory');
    await expect(page.getByText(/Captured .+!/)).toBeVisible();
    await page.getByText('Garrison', { exact: true }).click();
    await expect(page.locator('#garrisonTable .garrisonRow')).toHaveCount(save.garrison.length + 1);
    expect((await storedSave(page)).garrison).toHaveLength(save.garrison.length + 1);
    expect(errors).toEqual([]);
  });

  test('5. practice vs the Dummy gives no XP', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(START);
    await newGameToGarrison(page);
    await expect(page.locator('#garrisonTable .garrisonRow')).toHaveCount(1);

    await startBattle(page, PRACTICE);
    await killEnemy(page);
    await waitForRoute(page, '#victory');
    await expect(page.getByText('Victory!')).toBeVisible();
    await expect(page.getByText(/XP/)).toHaveCount(0);
    expect((await storedSave(page)).garrison[0]?.experience).toBe(1);
    expect(errors).toEqual([]);
  });

  test('6. settings difficulty persists and changes the player max HP', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(START);
    await newGameToGarrison(page);
    await expect(page.locator('#garrisonTable .garrisonRow')).toHaveCount(1);

    await startBattle(page, PRACTICE);
    const [casual] = await characters(page, 0);
    await leaveBattle(page);

    await goToHash(page, '#settings');
    await page.getByLabel('Hard', { exact: true }).check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await waitForRoute(page, '#main');
    expect((await storedSave(page)).difficulty).toBe(1.12);
    await page.reload();
    await goToHash(page, '#settings');
    await expect(page.getByLabel('Hard', { exact: true })).toBeChecked();

    await startBattle(page, PRACTICE);
    const [hard] = await characters(page, 0);
    expect(casual && hard).toBeTruthy();
    expect(hard?.maxHp).toBeCloseTo(((casual?.maxHp ?? 0) * 0.66) / 1.12, 3);
    expect(errors).toEqual([]);
  });

  for (const [name, difficulty] of [
    ['v0-with-params', 0.66],
    ['v0-settings-strings', 1.12],
  ] as const) {
    test(`7. legacy ${name} loads, migrates to v1 and leaves a raw v0 backup`, async ({ page }) => {
      const errors = collectErrors(page);
      const raw = fixtureText(name);
      await page.goto(START);
      await page.evaluate(`window.localStorage.setItem('Taming the Elements', ${JSON.stringify(raw)})`);
      await page.reload();
      await expect(page.locator('#menu')).toBeVisible();

      // Starting a battle makes the app load (and so migrate) the stored save.
      await startBattle(page, PRACTICE);
      const save = await storedSave(page);
      expect(save.schemaVersion).toBe(1);
      expect(save.difficulty).toBe(difficulty);
      // Unknown fields (the legacy battle `params`) are preserved by design (docs/SAVE-FORMAT.md) and ignored by the app.
      expect(save.garrison[0]?.characterName).toBe('Fiara');
      expect(await page.evaluate<string | null>(`window.localStorage.getItem(${JSON.stringify(BACKUP_KEY)})`)).toBe(
        raw,
      );
      expect(errors).toEqual([]);
    });
  }

  test('8. pause via keyboard stops stepping, and resuming steps again', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?seed=7');
    await newGameToGarrison(page);
    await expect(page.locator('#garrisonTable .garrisonRow')).toHaveCount(1);
    await page.locator('#garrisonTable .garrisonRow').first().click();
    await page.locator(`#${PRACTICE}`).click();
    await page.waitForFunction(`window.__TTE__.scene === 'Arena' && window.__TTE__.state().tick > 0`);

    await page.keyboard.press('Shift+P');
    await page.waitForFunction(`window.__TTE__.state().paused === true`);
    // Ten rendered frames pass with the tick unchanged.
    const frozen = await page.evaluate<boolean>(`(async () => {
      const t = window.__TTE__.state().tick;
      for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
      return window.__TTE__.state().tick === t;
    })()`);
    expect(frozen).toBe(true);

    const t = await page.evaluate<number>(`window.__TTE__.state().tick`);
    await page.keyboard.press('Shift+P');
    await page.waitForFunction(`window.__TTE__.state().paused === false && window.__TTE__.state().tick > ${String(t)}`);
    expect(errors).toEqual([]);
  });

  test('9. capturing the final boss is blocked', async ({ page }) => {
    const errors = collectErrors(page);
    await seedViaGameMaster(page, fixture('v0-ch4'));

    await startBattle(page, PORTAL, 3);
    const [hero] = await characters(page, 0);
    const [boss] = await characters(page, 1);
    expect(hero && boss).toBeTruthy();
    await page.evaluate(
      `const a = window.__TTE__.arena;
       a.place(${String(hero?.id)}, 300, 300, 0);
       a.place(${String(boss?.id)}, 420, 300, 0);
       a.setHp(${String(boss?.id)}, 1);
       a.step(1, [${String(CAPTURE)}, 0]);
       a.step(60, [0, 0]);`,
    );
    const after = await characters(page, 1);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(boss?.id);
    expect(after[0]?.hp).toBeGreaterThan(0);
    expect(await page.evaluate<string>(`window.__TTE__.state().route`)).toBe('#loading');
    expect(errors).toEqual([]);
  });
});
