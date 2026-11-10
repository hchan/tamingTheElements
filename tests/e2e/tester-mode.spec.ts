import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  ARENA_READY,
  SAVE_KEY,
  characters,
  collectErrors,
  fixture,
  goToHash,
  killEnemy,
  newGameToGarrison,
  seedViaGameMaster,
  startBattle,
  storedSave,
  waitForRoute,
  START,
} from './parity/helpers';

const BATTLE = 'enterBattlegroundContainer';
const CAPTURE = 64; // Cmd.capture
const SWAP1 = 128; // Cmd.swap1
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

interface Row {
  id: number;
  name: string;
  active: boolean;
  dead: boolean;
  hp: number;
  maxHp: number;
  restCap: number;
}
interface Slot {
  kind: string;
  label: string;
  disabled: boolean;
}

const bench = (page: Page): Promise<Row[]> => page.evaluate<Row[]>(`window.__TTE__.arena.bench()`);
const slots = (page: Page): Promise<Slot[]> => page.evaluate<Slot[]>(`window.__TTE__.arena.actionSlots()`);
const arena = (page: Page, code: string): Promise<unknown> => page.evaluate(`(() => { const a = window.__TTE__.arena; ${code} })()`);
const activeId = async (page: Page): Promise<number> => (await characters(page, 0))[0]?.id ?? -1;

async function enterCode(page: Page): Promise<void> {
  await page.getByRole('heading', { level: 1, name: 'Taming the Elements' }).waitFor();
  for (const k of KONAMI) await page.keyboard.press(k);
  await expect(page.locator('#testerBadge')).toContainText('TESTER MODE');
}

async function openPanel(page: Page): Promise<void> {
  await page.locator('#testerBadge').click();
  await expect(page.locator('#testerPanel')).toBeVisible();
}

async function closePanel(page: Page): Promise<void> {
  await page.locator('#testerClose').click();
  await expect(page.locator('#testerPanel')).toHaveCount(0);
}

test.describe('Capture through normal progression (no cheats)', () => {
  test('chapter 1 -> level 5 -> objectives -> chapter 2 -> Capture unlocked, usable at <=25% HP, captured monster joins the garrison', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto(START);
    await expect(page.locator('#testerBadge')).toBeHidden();
    await newGameToGarrison(page);
    expect((await storedSave(page)).garrison[0]?.experience).toBe(1);

    // Four stepped wins: 1 XP each takes the hero from level 1 to level 5, the chapter 1 objective.
    for (let win = 1; win <= 4; win++) {
      await startBattle(page, BATTLE);
      expect(await page.evaluate<boolean>(`window.__TTE__.arena.captureGranted()`)).toBe(false);
      await killEnemy(page);
      await waitForRoute(page, '#victory');
      await expect(page.getByText(/gained 1 XP/)).toBeVisible();
    }
    expect((await storedSave(page)).garrison[0]?.experience).toBe(5);
    await expect(page.locator('#objectivesMet')).toContainText('Capture ability is unlocked');

    await page.getByText('Current Objectives', { exact: true }).click();
    await expect(page.locator('#captureNotice')).toHaveCount(0);
    await page.getByRole('button', { name: 'Begin next chapter' }).click();
    await expect(page.locator('#captureNotice')).toContainText('Capture unlocked!');
    await expect(page.locator('#captureNotice')).toContainText('Press C');
    await expect.poll(async () => (await storedSave(page)).chapter).toBe(2);
    await page.locator('#continueToGarrison').click();
    await waitForRoute(page, '#garrison');

    await startBattle(page, BATTLE);
    expect(await page.evaluate<boolean>(`window.__TTE__.arena.captureGranted()`)).toBe(true);
    // The Capture slot is on the action bar, labelled with its live key, and greyed out while the enemy is healthy.
    await expect.poll(async () => (await slots(page)).find((s) => s.kind === 'capture')?.label).toBe('C');
    expect((await slots(page)).find((s) => s.kind === 'capture')?.disabled).toBe(true);

    const [hero] = await characters(page, 0);
    const [enemy] = await characters(page, 1);
    await arena(
      page,
      `a.place(${String(hero?.id)}, 300, 300, 0); a.place(${String(enemy?.id)}, 420, 300, 0);
       a.setHp(${String(enemy?.id)}, ${String((enemy?.maxHp ?? 0) * 0.2)}); a.step(1);`,
    );
    await expect.poll(async () => (await slots(page)).find((s) => s.kind === 'capture')?.disabled).toBe(false);
    await arena(page, `a.step(1, [${String(CAPTURE)}, 0]); a.step(60, [0, 0]);`);
    await waitForRoute(page, '#victory');
    await expect(page.getByText(/Captured .+!/)).toBeVisible();
    expect((await storedSave(page)).garrison).toHaveLength(2);
    expect(errors).toEqual([]);
  });
});

test.describe('Tester mode', () => {
  test('is off by default and the Settings code field turns it on', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(START);
    await expect(page.locator('#testerBadge')).toBeHidden();
    await expect(page.locator('#testerOptionsMenu')).toHaveCount(0);
    await goToHash(page, '#settings');
    await page.locator('#testerCode').fill('wrong');
    await page.locator('#testerCodeApply').click();
    await expect(page.locator('#testerCodeStatus')).toHaveText('That is not the tester code.');
    await expect(page.locator('#testerBadge')).toBeHidden();
    await page.locator('#testerCode').fill('Taming-Tester');
    await page.locator('#testerCodeApply').click();
    await expect(page.locator('#testerBadge')).toContainText('TESTER MODE - progress not saved');
    // Per tab: it survives a reload, and the menu now offers the tester options.
    await page.reload();
    await expect(page.locator('#testerBadge')).toContainText('TESTER MODE');
    await goToHash(page, '#main');
    await page.locator('#testerOptionsMenu').click();
    await expect(page.locator('#testerPanel')).toBeVisible();
    await page.locator('#testerOff').click();
    await expect(page.locator('#testerBadge')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('?cheats=1 enables it in test builds', async ({ page }) => {
    await page.goto(`${START}&cheats=1`);
    await expect(page.locator('#testerBadge')).toContainText('TESTER MODE');
  });

  test('the code, 3 heroes, all abilities incl. Capture in a chapter-1 save, swap, benched health recovering, instant swap', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await seedViaGameMaster(page, fixture('v0-new-game'));
    await page.goto(START);
    await enterCode(page);
    await page.locator('#testerOptionsMenu').waitFor();

    // Every race into the (throwaway) garrison; the real save is untouched.
    await openPanel(page);
    await page.locator('#tester-add-races').click();
    await expect(page.locator('#testerStatus')).toHaveText('Add every race: done.');
    await closePanel(page);
    const real = await storedSave(page);
    expect(real.chapter).toBe(1);
    expect(real.garrison).toHaveLength(1);

    await goToHash(page, '#garrison');
    const rows = page.locator('#garrisonTable .garrisonRow');
    expect(await rows.count()).toBeGreaterThanOrEqual(12);
    for (let i = 0; i < 3; i++) await rows.nth(i).click();
    await page.locator(`#${BATTLE}`).click();
    await page.waitForFunction(ARENA_READY);

    // All abilities including Capture in chapter 1, and a 3-hero team with Swap.
    expect(await page.evaluate<boolean>(`window.__TTE__.arena.captureGranted()`)).toBe(true);
    await expect.poll(async () => (await slots(page)).filter((s) => s.kind === 'swap').length).toBe(2);
    expect((await slots(page)).find((s) => s.kind === 'capture')?.label).toBe('C');
    await expect(page.locator('#testerBench .testerBenchRow')).toHaveCount(3);

    // Capture works at <=25% enemy HP in this chapter-1 save.
    const [hero0] = await characters(page, 0);
    const [enemy0] = await characters(page, 1);
    await arena(
      page,
      `a.place(${String(hero0?.id)}, 300, 300, 0); a.place(${String(enemy0?.id)}, 420, 300, 0);
       a.setHp(${String(enemy0?.id)}, ${String((enemy0?.maxHp ?? 0) * 0.2)}); a.step(1, [${String(CAPTURE)}, 0]); a.step(60, [0, 0]);`,
    );
    expect((await characters(page, 1))[0]?.id).not.toBe(enemy0?.id);

    // Swap away from a wounded hero; the benched hero's health must rise monotonically up to its rest cap.
    const a = (await bench(page)).find((r) => r.active) as Row;
    await arena(page, `a.setHp(${String(a.id)}, ${String(a.maxHp * 0.2)}); a.step(1, [${String(SWAP1)}, 0]);`);
    expect(await activeId(page)).not.toBe(a.id);
    const benched = (await bench(page)).find((r) => r.id === a.id) as Row;
    expect(benched.active).toBe(false);
    expect(benched.hp).toBeCloseTo(a.maxHp * 0.2, 5);
    expect(benched.restCap).toBeCloseTo(a.maxHp * 0.6, 5);
    const samples = [benched.hp];
    for (let i = 0; i < 90; i++) {
      await arena(page, `a.step(50);`);
      samples.push(((await bench(page)).find((r) => r.id === a.id) as Row).hp);
    }
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] as number);
    expect(samples[10]).toBeGreaterThan(samples[0] as number);
    expect(samples.at(-1)).toBeCloseTo(benched.restCap, 5);
    expect(Math.max(...samples)).toBeLessThanOrEqual(benched.restCap + 1e-9);
    // The bench HUD shows the same numbers, with the rest cap in words.
    const row = page.locator(`#testerBench .testerBenchRow[data-id="${String(a.id)}"]`);
    await expect.poll(async () => Number(await row.getAttribute('data-hp'))).toBeCloseTo(benched.restCap, 3);
    await expect(row.locator('.testerBenchText')).toContainText('rest cap');

    // Swap back: the healed hero returns with its recovered health, then the normal 5 s cooldown applies.
    await arena(page, `a.step(1, [${String(SWAP1)}, 0]);`);
    expect(await activeId(page)).toBe(a.id);
    const back = (await characters(page, 0))[0];
    expect(back?.hp).toBeCloseTo(benched.restCap, 5);
    const tick = await page.evaluate<number>(`window.__TTE__.arena.tick`);
    expect(await page.evaluate<number>(`window.__TTE__.arena.swapReadyTick()`)).toBeGreaterThan(tick);
    await arena(page, `a.step(1, [${String(SWAP1)}, 0]);`);
    expect(await activeId(page)).toBe(a.id);

    // Instant swap removes the cooldown: two swaps on consecutive ticks.
    await openPanel(page);
    await page.locator('#tester-opt-instantSwap').check();
    await closePanel(page);
    await arena(page, `a.step(1, [${String(SWAP1)}, 0]);`);
    const first = await activeId(page);
    expect(first).not.toBe(a.id);
    await arena(page, `a.step(1, [${String(SWAP1)}, 0]);`);
    expect(await activeId(page)).not.toBe(first);
    expect(errors).toEqual([]);
  });

  test('a tester win never reaches the real save; its replay is flagged cheats', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await seedViaGameMaster(page, fixture('v0-new-game'));
    await page.goto(`${START}&ff=record&cheats=1`);
    await expect(page.locator('#testerBadge')).toContainText('TESTER MODE');
    await startBattle(page, BATTLE);
    await openPanel(page);
    await page.locator('#tester-cheat-win').click();
    await closePanel(page);
    await arena(page, `a.step(1);`);
    await waitForRoute(page, '#victory');
    await expect(page.getByText('written to the throwaway slot')).toBeVisible();
    expect((await storedSave(page)).garrison[0]?.experience).toBe(1);
    const slot = await page.evaluate<string>(`window.sessionStorage.getItem(${JSON.stringify(SAVE_KEY)})`);
    expect((JSON.parse(slot) as { garrison: { experience: number }[] }).garrison[0]?.experience).toBe(2);

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#downloadReplay').click()]);
    const file = testInfo.outputPath('tester.replay.json');
    await download.saveAs(file);
    const replay = JSON.parse(readFileSync(file, 'utf8')) as { header: { cheats?: boolean; flags: string } };
    expect(replay.header.cheats).toBe(true);
    expect(replay.header.flags).toContain('testerCapture');
    expect(errors).toEqual([]);
  });

  test('Keep cheat progress writes to the real save; God mode and the HP buttons act on the battle', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.goto(`${START}&cheats=1`);
    await newGameToGarrison(page);
    await openPanel(page);
    page.once('dialog', (d) => void d.accept());
    await page.locator('#tester-opt-keepProgress').check();
    await expect(page.locator('#testerBadge')).toContainText('keeping progress');
    await page.locator('#tester-level-level-to-5').click();
    await expect(page.locator('#testerStatus')).toHaveText('Level to 5: done.');
    await closePanel(page);
    expect((await storedSave(page)).garrison[0]?.experience).toBe(5);

    await startBattle(page, BATTLE);
    await openPanel(page);
    await page.locator('#tester-opt-godMode').check();
    await page.locator('#tester-cheat-enemyHp25').click();
    await closePanel(page);
    const [hero] = await characters(page, 0);
    const [enemy] = await characters(page, 1);
    await arena(page, `a.setHp(${String(hero?.id)}, 1); a.step(1);`);
    expect((await characters(page, 0))[0]?.hp).toBe(hero?.maxHp);
    expect((await characters(page, 1))[0]?.hp).toBeCloseTo((enemy?.maxHp ?? 0) * 0.25, 5);
    expect(errors).toEqual([]);
  });

  test('the pause dialog reaches the tester options; Escape closes only the panel, and Shift-Q wins once cheats are on', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    // No `manual=1`: manual stepping pauses with the user reason, which would make the first Shift-P a resume.
    await page.goto('/?seed=7&cheats=1');
    await newGameToGarrison(page);
    await startBattle(page, BATTLE);
    await page.keyboard.press('Shift+P');
    await expect(page.locator('#pauseOverlay')).toBeVisible();
    await page.locator('#pauseTester').click();
    await expect(page.locator('#testerPanel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#testerPanel')).toHaveCount(0);
    await expect(page.locator('#pauseOverlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pauseOverlay')).toBeHidden();
    // Legacy Shift-Q (I win) works in tester mode.
    await page.keyboard.press('Shift+Q');
    await arena(page, `a.step(1);`);
    await waitForRoute(page, '#victory');
    expect(errors).toEqual([]);
  });
});
