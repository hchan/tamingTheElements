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

/** Arcade round 1's intro (FUN-DESIGN 2.10): nobody acts until tick 91. */
const ARCADE_INTRO = 91;
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
      // Round 1's intro first (nobody acts until tick 91). Curomo 80 px from Pax, facing: Shards of Ice land within a few
      // ticks. Paused effects hold their frame.
      await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(${String(ARCADE_INTRO)}); const [me, foe] = a.characters(); a.place(me.id, 500, 360, 0); a.place(foe.id, 580, 360, 4); })()`);
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

    test('arcade defence (demo, Arcade ruleset)', async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7');
      await page.locator('#game canvas').waitFor();
      await page.waitForFunction(ARENA_READY);
      if (vp.mobile) await page.locator('#rotateDismiss').click();
      const frames = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;
      const pops = (): Promise<string[]> => page.evaluate<string[]>(`window.__TTE__.arena.defence().then((d) => d ? d.pops : [])`);
      // Curomo 80 px from Pax; Pax guards past the parry window, then Curomo's Shards of Ice land on the shield.
      const place = (meX: number, foeX: number): string =>
        `(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, ${String(meX)}, 360, 0); a.place(foe.id, ${String(foeX)}, 360, 4); })()`;
      // Past the intro and the 1 s FIGHT! banner.
      await page.evaluate(`window.__TTE__.arena.step(${String(ARCADE_INTRO + 50)})`);
      await page.evaluate(place(500, 580));
      await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(12, [0, ${String(CMD.guard)}]); a.step(1, [${String(CMD.secondary)}, ${String(CMD.guard)}]); a.step(3, [0, ${String(CMD.guard)}]); })()`);
      await page.evaluate(frames);
      await shoot(page, vp, 'arena', 'arena-arcade-guard', "Arcade guard: Pax's shield bubble (white rim) and guard bar (quarter notches) under him, pale blue chip sparks from Curomo's Shards of Ice");
      // A guard press, then Curomo's Ice Shock lands inside the parry window (tried after the cooldown and whiff lock).
      for (let i = 0; i < 4 && !(await pops()).includes('PARRY'); i++) {
        await page.evaluate(`window.__TTE__.arena.step(60)`);
        await page.evaluate(place(500, 580));
        await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(1, [0, ${String(CMD.guard)}]); a.step(1, [${String(CMD.primary)}, 0]); a.step(2); })()`);
      }
      expect(await pops()).toContain('PARRY');
      await page.evaluate(frames);
      await shoot(page, vp, 'arena', 'arena-arcade-parry', 'Arcade parry: white flash and gold ping ring on Pax, PARRY over him; Curomo stunned by the parried Ice Shock');
      await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(40); a.step(1, [${String(CMD.dash | CMD.up)}, 0]); a.step(5); })()`);
      await page.evaluate(frames);
      await shoot(page, vp, 'arena', 'arena-arcade-dash', "Arcade dash: three afterimages (alpha 0.5, 0.3, 0.15, in Curomo's element colour) behind Curomo dashing up");
      // Shards of Ice again (10 s cooldown) from across the arena: a ring of bullets, each trailing three fading dots.
      await page.evaluate(`window.__TTE__.arena.step(500)`);
      await page.evaluate(place(300, 1100));
      await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(1, [${String(CMD.secondary)}, 0]); a.step(15); })()`);
      await page.evaluate(frames);
      await shoot(page, vp, 'arena', 'arena-arcade-trails', 'Arcade projectile trails (VISUAL-QA V10): Shards of Ice flying out in a ring, three fading dots behind each');
      // Pax keeps guarding Ice Shocks (put back in reach after each knockback) until the guard meter runs out.
      const broke = await page.evaluate<boolean>(`(async () => {
        const a = window.__TTE__.arena;
        for (let i = 0; i < 240; i++) {
          if (i % 6 === 0) ${place(500, 580)};
          a.step(10, [${String(CMD.primary)}, ${String(CMD.guard)}]);
          if ((await a.defence()).pops.includes('GUARD BREAK')) return true;
        }
        return false;
      })()`);
      expect(broke).toBe(true);
      await page.evaluate(frames);
      await shoot(page, vp, 'arena', 'arena-arcade-guard-break', 'Arcade guard break: shield shards flying out, an orange ring and GUARD BREAK over Pax, his guard bar empty');
      expect(errors).toEqual([]);
    });

    test('arcade weather (demo and Arcade Versus)', async ({ page }) => {
      const errors = collectErrors(page);
      // 40 ticks after each cast: the tint has faded in, the particles fly and the called line still shows.
      const cast = async (cmds: string, state: string, note: string): Promise<void> => {
        // Weather needs a full charge (WP-arcade-weather-charge): both teams get one for each cast.
        await page.evaluate(`window.__TTE__.arena.setWeatherCharge(0, 1000); window.__TTE__.arena.setWeatherCharge(1, 1000)`);
        await page.evaluate(cmds);
        await page.evaluate(`window.__TTE__.arena.step(40)`);
        await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
        await shoot(page, vp, 'arena', state, note);
      };
      const badge = 'the HUD badge under the round pips (glyph, word, seconds left, notched time bar)';
      await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7');
      await page.locator('#game canvas').waitFor();
      await page.waitForFunction(ARENA_READY);
      if (vp.mobile) await page.locator('#rotateDismiss').click();
      // Past the intro and the 1 s FIGHT! banner.
      await page.evaluate(`window.__TTE__.arena.step(${String(ARCADE_INTRO + 50)})`);
      await cast(STEP(1, CMD.weather, 0), 'arena-arcade-weather-rain', `Arcade Rain (Curomo's cast): blue-grey sky tint, rain streaks slanting down, "Rain!" and ${badge} RAIN 10`);
      await cast(STEP(1, 0, CMD.weather), 'arena-arcade-weather-sandstorm', `Arcade Sandstorm (Pax replaces the Rain): sandy tint, grains blown to the right, "Sandstorm!" and ${badge} SAND 10`);
      // No void race is offered in Arcade, so Eclipse comes through the test probe (as a cast would).
      await cast(`window.__TTE__.arena.setWeather(5, 1)`, 'arena-arcade-weather-eclipse', `Arcade Eclipse (test probe): the arena dimmed, dark violet motes rising, "Eclipse!" and ${badge} ECLIPSE 10 with an eclipsed-sun glyph`);
      await page.goto(`${START}&ff=arcade#arcade`);
      await page.getByLabel('Your race').selectOption('sindarosa');
      await page.getByLabel('AI race').selectOption('cyclonius');
      await page.getByRole('button', { name: 'Fight!' }).click();
      await page.waitForFunction(ARENA_READY);
      if (vp.mobile) await page.locator('#rotateDismiss').click();
      await page.evaluate(`window.__TTE__.arena.step(${String(ARCADE_INTRO + 50)})`);
      await cast(STEP(1, CMD.weather, 0), 'arcade-weather-sun', `Arcade Versus Sunshine (Sindarosa's cast): warm tint, five sun rays from the top-left corner, "Sunshine!" and ${badge} SUN 10; the touch Weather button above Dash`);
      await cast(STEP(1, 0, CMD.weather), 'arcade-weather-gale', `Arcade Versus Gale (Cyclonius replaces the Sunshine): pale tint, long wind streaks, "Gale!" and ${badge} GALE 10`);
      expect(errors).toEqual([]);
    });

    test('arcade versus menus (Settings opt-in)', async ({ page }) => {
      const errors = collectErrors(page);
      await seed(page, { ...(fixture('v0-ch3') as object), arcadePreview: true });
      await page.goto(`${START}#main`);
      await page.getByRole('button', { name: 'Arcade Versus' }).waitFor();
      await freeze(page);
      await shoot(page, vp, 'main', 'menu-arcade', 'Main menu with Settings > Arcade Versus (preview) ticked: the extra entry under Continue');
      await menuScreen(page, '#arcade', 'Fight!');
      await shoot(page, vp, 'arcade', 'arcade-pick', 'Arcade Versus picker: your race, AI race, AI level (labelled selects), Fight! and Back');
      await page.getByRole('button', { name: 'Fight!' }).click();
      await page.waitForFunction(ARENA_READY);
      if (vp.mobile) await page.locator('#rotateDismiss').click();
      await expect.poll(() => page.evaluate<string | undefined>(`window.__TTE__.arena.rounds().then((r) => r && r.main)`)).toBe('ROUND 1');
      await page.evaluate(`window.__TTE__.arena.step(40)`);
      await shoot(page, vp, 'arena', 'arcade-battle', 'Arcade Versus round 1 intro (tick 40): ROUND 1 banner, timer 90 and empty round pips top centre, hyper meters, the touch Super, Guard, Dash and Weather buttons bottom right');
      await page.evaluate(`window.__TTE__.arena.step(${String(ARCADE_INTRO - 40 + 30)})`);
      await shoot(page, vp, 'arena', 'arcade-fight', 'Arcade Versus FIGHT! banner 30 ticks into the fight (scale-in done)');
      // Up + right held, then Fire Blast: the 8-way aim arrow points north-east and the bullet flies that way.
      await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(3, [9, 0]); a.step(1, [16, 0]); a.step(6); })()`);
      await shoot(page, vp, 'arena', 'arcade-aim', 'Arcade 8-way aim: the white arrow north-east of Sindarosa (held up + right) and a Fire Blast flying north-east');
      // A perfect KO (the foe drops, the player untouched), its result, then round 2 KO'd the same way ends the match 2-0.
      const [foe] = await characters(page, 1);
      await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setHp(${String(foe?.id)}, 0); a.step(31); })()`);
      await shoot(page, vp, 'arena', 'arcade-ko', 'Arcade K.O. with PERFECT (the player at full health) during the KO slow motion');
      await page.evaluate(`window.__TTE__.arena.step(120)`);
      await shoot(page, vp, 'arena', 'arcade-round-end', 'Arcade round end: PERFECT, YOU WIN ROUND 1, the first round pip filled on the left');
      await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(60 + ${String(ARCADE_INTRO)} + 5); const [f] = a.characters().filter((c) => c.team === 1); a.setHp(f.id, 0); a.step(30 + 120 + 60 + 5); })()`);
      await page.getByRole('heading', { level: 1, name: 'Victory!' }).waitFor();
      await page.evaluate(`window.__TTE__.settled()`);
      await freeze(page);
      await shoot(page, vp, 'arcade', 'arcade-results', 'Arcade Versus results: outcome, fighters, "saves nothing", Rematch, Change fighters, Main Menu');
      expect(errors).toEqual([]);
    });

    test('arcade tag team (2v2)', async ({ page }) => {
      const errors = collectErrors(page);
      const frame = (): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      await page.goto(`${START}&ff=arcade#arcade`);
      await page.getByLabel('Team').selectOption('2');
      await page.getByLabel('Your race').selectOption('sindarosa');
      await page.getByLabel('Your partner (2v2)').selectOption('pax');
      await page.getByLabel('AI race').selectOption('fiara');
      await freeze(page);
      await shoot(page, vp, 'arcade', 'arcade-tag-pick', 'Arcade Versus picker in 2v2: Team 2v2 tag team, your race and partner (enabled), AI race and level');
      await page.getByRole('button', { name: 'Fight!' }).click();
      await page.waitForFunction(ARENA_READY);
      if (vp.mobile) await page.locator('#rotateDismiss').click();
      // Past the intro and FIGHT!; the lead hurt to 45%, so the red life shows on its bar.
      await page.evaluate(`window.__TTE__.arena.step(${String(ARCADE_INTRO + 50)})`);
      const [lead] = await characters(page, 0);
      await page.evaluate(`window.__TTE__.arena.setHp(${String(lead?.id)}, ${String(Math.round((lead?.maxHp ?? 0) * 0.45))})`);
      await page.evaluate(`window.__TTE__.arena.step(1)`);
      await frame();
      await shoot(page, vp, 'arena', 'arcade-tag-fight', 'Arcade 2v2: gold frame on the active bar, "IN Sindarosa  BENCH Pax 100%" and TAG READY with a full gold bar under each side, the TAG caption over the swap slot, the touch Tag button above Weather');
      await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(1, [${String(1 << 7)}, 0]); a.step(4); })()`);
      await frame();
      await shoot(page, vp, 'arena', 'arcade-tag-in', 'Arcade tag-in, 5 ticks on: TAG! on the left, the entrance flash (white core, ring, speed lines from the left) on Pax at Sindarosa\'s spot, "BENCH Sindarosa 46% +28% red" with red dashes on the bench bar, the tag bar empty with TAG 2.9s');
      const [pax] = await characters(page, 0);
      await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setHp(${String(pax?.id)}, 0); a.step(5); })()`);
      await frame();
      await shoot(page, vp, 'arena', 'arcade-tag-ko-entrance', 'Arcade KO entrance, 5 ticks on: SINDAROSA IN! in gold, the gold double ring on Sindarosa, "BENCH Pax K.O." and NO TAG');
      for (let round = 0; round < 2; round++) {
        for (let k = 0; k < 2; k++) {
          const [foe] = await characters(page, 1);
          await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setHp(${String(foe?.id)}, 0); a.step(1); })()`);
        }
        await page.evaluate(`window.__TTE__.arena.step(${String(30 + 120 + 60 + 5 + (round === 0 ? ARCADE_INTRO : 0))})`);
      }
      await page.getByRole('heading', { level: 1, name: 'Victory!' }).waitFor();
      await page.evaluate(`window.__TTE__.settled()`);
      await freeze(page);
      await shoot(page, vp, 'arcade', 'arcade-tag-results', "Arcade 2v2 results: both heroes of each team with their HP left or knocked out, the round score");
      expect(errors).toEqual([]);
    });
  });
}

export type { Vp };
