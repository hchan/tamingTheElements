// `pnpm visual:capture`: PNG screenshots of every key screen and state at 1280x720 and 390x844, written to
// test-results/visual/<state>-<viewport>.png with a manifest.json. These tests assert only that the screen rendered
// (no console errors, expected landmark present); a human or an AI reviewer opens the PNGs (docs/VISUAL-QA.md).
import { expect, test, type Page } from '@playwright/test';
import {
  ARENA_READY,
  CMD,
  START,
  STEP,
  VIEWPORTS,
  canvasBox,
  characters,
  collectErrors,
  fixture,
  freeze,
  goToHash,
  seedViaGameMaster,
  shoot,
  startBattle,
  waitForRoute,
  type Vp,
} from './support';

const CINEMATIC_READY = `window.__TTE__ && window.__TTE__.scene === 'Cinematic' && !!window.__TTE__.cinematic`;

/** v0-complete trimmed to six garrison members (the legacy maximum a human would plausibly collect). */
function sixCharacterSave(): unknown {
  const s = fixture('v0-complete');
  return { ...s, garrison: s.garrison.slice(0, 6) };
}

async function seed(page: Page, save: unknown): Promise<void> {
  await seedViaGameMaster(page, save);
}

async function menuScreen(page: Page, hash: string, landmark: string | RegExp): Promise<void> {
  await goToHash(page, hash);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await expect(page.locator('body')).toContainText(landmark);
  await freeze(page);
}

for (const vp of VIEWPORTS) {
  test.describe(`capture ${vp.key}`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });

    test('menu screens', async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(START);
      await page.getByRole('heading', { level: 1, name: 'Taming the Elements' }).waitFor();
      await freeze(page);
      await shoot(page, vp, 'main', 'menu-no-save', 'Main menu, fresh profile: Continue/Garrison disabled');
      await seed(page, fixture('v0-ch3'));
      await page.goto(`${START}#main`);
      await page.getByRole('heading', { level: 1, name: 'Taming the Elements' }).waitFor();
      await freeze(page);
      await shoot(page, vp, 'main', 'menu-with-save', 'Main menu with a chapter 3 save');

      await seed(page, fixture('v0-new-game'));
      await menuScreen(page, '#garrison', 'Fiara');
      await shoot(page, vp, 'garrison', 'garrison-1', 'Garrison with a single character');
      await seed(page, sixCharacterSave());
      await menuScreen(page, '#garrison', 'Level');
      await shoot(page, vp, 'garrison', 'garrison-6', 'Garrison with six characters');
      await page.locator('#garrisonTable .garrisonRow').nth(0).click();
      await page.locator('#garrisonTable .garrisonRow').nth(1).click();
      await shoot(page, vp, 'garrison', 'garrison-6-selected', 'Two characters selected for battle (order badges, buttons)');

      const first = fixture('v0-complete').garrison[0];
      await menuScreen(page, '#settings', 'Save');
      await shoot(page, vp, 'settings', 'settings', 'Settings');
      await menuScreen(page, '#currentObjectives', 'Chapter');
      await shoot(page, vp, 'objectives', 'objectives', 'Current objectives');
      await menuScreen(page, '#wiki', 'Wiki');
      await shoot(page, vp, 'wiki', 'wiki', 'Wiki index');
      await menuScreen(page, '#keyBindings', 'Move');
      await shoot(page, vp, 'keyBindings', 'key-bindings', 'Key bindings');
      await menuScreen(page, '#about', 'Taming');
      await shoot(page, vp, 'about', 'about', 'About');
      await page.goto(`${START}#character_${first?.id ?? ''}`);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      await freeze(page);
      await shoot(page, vp, 'character', 'character-details', 'Character details for the first garrison member');
      expect(errors).toEqual([]);
    });

    test('new game cinematic frames', async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(START);
      await page.getByText('New Game', { exact: true }).click();
      await page.waitForFunction(CINEMATIC_READY);
      for (const [i, ms] of [800, 3000, 6000].entries()) {
        await page.waitForTimeout(ms);
        await shoot(page, vp, 'cinematic', `cinematic-frame${String(i + 1)}`, `Intro cinematic, about ${String(Math.round(ms / 100) / 10)} s after the previous frame (wall clock)`, false);
      }
      expect(errors).toEqual([]);
    });

    test('error screens', async ({ page }) => {
      await page.goto('/?ff=forceNoWebgl');
      await expect(page.getByRole('alert')).toContainText('WebGL is required');
      await shoot(page, vp, 'error', 'error-no-webgl', 'WebGL unavailable error screen');
      await page.goto(`${START}#character_does-not-exist`);
      await page.locator('body').waitFor();
      await freeze(page);
      await shoot(page, vp, 'error', 'error-unknown-character', 'Character route with an id that is not in the garrison');
    });

    test('arena states', async ({ page }) => {
      const errors = collectErrors(page);
      await seed(page, fixture('v0-ch4'));
      await startBattle(page, 'enterPracticeContainer', 1);
      if (vp.mobile) {
        await expect(page.locator('#rotateOverlay')).toBeVisible();
        await shoot(page, vp, 'arena', 'rotate-overlay', 'Portrait phone: rotate-your-device overlay over the arena');
        await page.locator('#rotateDismiss').click();
      }
      const box = await canvasBox(page);
      expect(box).not.toBeNull();
      await page.evaluate(STEP(5, 0, 0));
      await shoot(page, vp, 'arena', 'arena-t005', `Arena at tick 5 (canvas box ${JSON.stringify(box)})`);

      // Face the two characters, then fire: projectiles and hits.
      const cs = await characters(page);
      const me = cs.find((c) => c.team === 0);
      const foe = cs.find((c) => c.team === 1);
      expect(me && foe).toBeTruthy();
      if (!me || !foe) return;
      const at = await page.evaluate<{ x: number; y: number }[]>(`window.__TTE__.arena.characters().map(c => ({ x: c.x, y: c.y }))`);
      const mid = ((at[0]?.x ?? 400) + (at[1]?.x ?? 800)) / 2;
      const y = at[0]?.y ?? 360;
      await page.evaluate(`window.__TTE__.arena.place(${String(me.id)}, ${String(mid - 140)}, ${String(y)}, 0); window.__TTE__.arena.place(${String(foe.id)}, ${String(mid + 140)}, ${String(y)}, 4)`);
      await page.evaluate(STEP(30, CMD.primary, 0));
      await page.evaluate(STEP(25, CMD.secondary, CMD.primary));
      await shoot(page, vp, 'arena', 'arena-t060', 'Arena at tick 60: both sides firing (projectiles, hits, flashes)');
      await page.evaluate(STEP(45, CMD.primary | CMD.secondary, CMD.secondary));
      await page.evaluate(STEP(45, CMD.primary, CMD.primary | CMD.secondary));
      await shoot(page, vp, 'arena', 'arena-t150', 'Arena at tick 150: sustained exchange (buffs, freeze or stun if the abilities apply them)');

      await page.evaluate(`window.__TTE__.arena.setHp(${String(me.id)}, ${String(Math.max(1, Math.floor(me.maxHp * 0.15)))})`);
      await page.evaluate(STEP(1, 0, 0));
      await shoot(page, vp, 'arena', 'arena-low-health', 'Player at 15% health: HUD bar and low-health cue');
      await page.evaluate(`window.__TTE__.arena.setHp(${String(foe.id)}, ${String(Math.max(1, Math.floor(foe.maxHp * 0.2)))})`);
      await page.evaluate(STEP(1, 0, 0));
      await shoot(page, vp, 'arena', 'arena-capture-window', 'Enemy at 20% health: capture slot highlighted (chapter 4 save)');

      await page.evaluate(`window.__TTE__.arena.setHp(${String(foe.id)}, 0); window.__TTE__.arena.step(1)`);
      await waitForRoute(page, '#victory');
      await freeze(page);
      await shoot(page, vp, 'victory', 'victory', 'Victory screen');
      expect(errors).toEqual([]);
    });

    test('defeat screen', async ({ page }) => {
      // The results routes render from the save, so navigate directly (a lost practice match does not reach #defeat).
      await seed(page, fixture('v0-ch4'));
      await goToHash(page, '#defeat');
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      await freeze(page);
      await shoot(page, vp, 'defeat', 'defeat', 'Defeat screen');
    });

    test('arena demo (bot vs bot)', async ({ page }) => {
      await page.goto('/?ff=arenaDemo&manual=1&seed=7');
      await page.locator('#game canvas').waitFor();
      await page.waitForFunction(ARENA_READY);
      await page.evaluate(`window.__TTE__.arena.step(150)`);
      await shoot(page, vp, 'arena', 'arena-demo-t150', 'Bot-vs-bot demo arena at tick 150 (no HUD data from a save)');
    });

    test('arcade hit feedback (demo, Arcade ruleset)', async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7');
      await page.locator('#game canvas').waitFor();
      await page.waitForFunction(ARENA_READY);
      if (vp.mobile) await page.locator('#rotateDismiss').click();
      // Curomo 80 px from Pax, facing: Shards of Ice land within a few ticks. Paused effects hold their frame.
      await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 500, 360, 0); a.place(foe.id, 580, 360, 4); })()`);
      await page.evaluate(`(() => { const a = window.__TTE__.arena; for (let i = 0; i < 20 && a.fx().numbers.length === 0; i++) a.step(1, [${String(CMD.secondary)}, 0]); })()`);
      expect(await page.evaluate<number>(`window.__TTE__.arena.fx().numbers.length`)).toBeGreaterThan(0);
      await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      await shoot(page, vp, 'arena', 'arena-arcade-hitstop', 'Arcade: first hit, during hit-stop (white flash, element sparks, damage number)');
      // Keep firing until the next volley lands (the numbers of the first one stay: paused effects do not age).
      await page.evaluate(`(() => { const a = window.__TTE__.arena; const n = a.fx().numbers.length; for (let i = 0; i < 60 && a.fx().numbers.length <= n; i++) a.step(1, [${String(CMD.secondary)}, 0]); })()`);
      await page.waitForFunction(`window.__TTE__.arena.fx().combo[0] >= 2`);
      await shoot(page, vp, 'arena', 'arena-arcade-combo', 'Arcade: a later volley (combo counter top left; greyed smaller numbers are combo-scaled)');
      // Out of reach, Curomo casts Ice Shock (+20 meter per cast) until its first bar is full and the second fills.
      await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 100, 360, 4); a.place(foe.id, 1100, 360, 4); a.step(2600, [${String(CMD.primary)}, 0]); })()`);
      await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      await shoot(page, vp, 'arena', 'arena-arcade-meter', 'Arcade: hyper meters under the HUD (full segments solid, the filling one dashed, bar count as a number)');
      // Facing each other, Curomo spends a bar on its super; 10 ticks into the 40-tick freeze the cut-in is in place.
      await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 300, 360, 0); a.place(foe.id, 900, 360, 4); a.step(1, [${String(CMD.super)}, 0]); a.step(10); })()`);
      await expect.poll(() => page.evaluate<string | undefined>(`window.__TTE__.arena.superFx().then((f) => f && f.name)`)).toBe('ELEMENTAL BURST');
      await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      await shoot(page, vp, 'arena', 'arena-arcade-super-freeze', 'Arcade: super freeze (arena dimmed, caster lit, element band with portrait, super name and element; camera punched in)');
      expect(errors).toEqual([]);
    });
  });
}

export type { Vp };
