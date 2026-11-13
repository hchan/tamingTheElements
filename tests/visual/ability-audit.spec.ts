// Ability graphics audit shots (docs/ABILITY-AUDIT.md, "Graphics" column; ideas/done/ability-graphics-audit-defects.md).
// Headless, test build, manual stepping: casts one ability at close range and saves frames at fixed tick offsets to
// ABILITY_OUT (default test-results/visual/abilities/<name>-<ticks>.png), full 1280x720 canvas. Run `pnpm visual:abilities`;
// ABILITY_ONLY=chaos-bolt,stick limits it to those names. Page-side code is passed as strings (no DOM lib in tsconfig.node).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors, goToHash, newGameToGarrison, startBattle } from '../e2e/parity/helpers';
import { CMD } from './support';

const OUT = process.env['ABILITY_OUT'] ?? join(process.cwd(), 'test-results', 'visual', 'abilities');
const ONLY = (process.env['ABILITY_ONLY'] ?? '').split(',').filter((s) => s !== '');
const INTRO = 91 + 50;
/** Ticks after the cast at which a frame is saved. */
const FRAMES = [1, 5, 10, 30, 60];

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const step = (page: Page, n: number, a = 0, b = 0): Promise<unknown> => page.evaluate(`window.__TTE__.arena.step(${String(n)}, [${String(a)}, ${String(b)}])`);

async function snap(page: Page, name: string, tick: number): Promise<void> {
  await frames(page);
  await page.screenshot({ path: join(OUT, `${name}-${String(tick).padStart(2, '0')}.png`), animations: 'disabled', caret: 'hide' });
}

/** Casts `cmd` for P1 (and `foeCmd` for P2) for one tick, then saves frames at FRAMES offsets. `hold` keeps the command down that many ticks. */
async function cast(page: Page, name: string, cmd: number, foeCmd = 0, hold = 1): Promise<void> {
  await step(page, hold, cmd, foeCmd);
  let t = hold;
  for (const f of FRAMES) {
    if (f > t) await step(page, f - t);
    t = Math.max(t, f);
    await snap(page, name, f);
  }
}

async function arcadeVersus(page: Page, player: string, enemy: string): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption(player);
  await page.getByLabel('AI race').selectOption(enemy);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await step(page, INTRO);
  // Close range, facing each other.
  await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 500, 380, 0); a.place(foe.id, 680, 380, 4); a.step(1); })()`);
}

const wanted = (name: string): boolean => ONLY.length === 0 || ONLY.includes(name);

interface Arc {
  readonly name: string;
  readonly player: string;
  readonly enemy: string;
  readonly cmd: number;
  readonly foeCmd?: number;
  readonly hold?: number;
  readonly meter?: boolean;
  readonly charge?: boolean;
}

const SUPER_RACES = ['cyclonius', 'echo', 'ishimi', 'lavax', 'morblass', 'rokcore', 'sindarosa', 'treenoc', 'wispera'];
const ARC: Arc[] = [
  // Snag sits in slot 1 (secondary) for Curomo and slot 0 (primary) for Echo, Treenoc and Wispera.
  { name: 'snag-curomo', player: 'curomo', enemy: 'pax', cmd: CMD.secondary },
  { name: 'snag-echo', player: 'echo', enemy: 'pax', cmd: CMD.primary },
  { name: 'snag-treenoc', player: 'treenoc', enemy: 'cyclonius', cmd: CMD.primary },
  { name: 'snag-wispera', player: 'wispera', enemy: 'pax', cmd: CMD.primary },
  { name: 'crimson-lavax', player: 'lavax', enemy: 'pax', cmd: CMD.primary },
  { name: 'branches-treenoc', player: 'treenoc', enemy: 'lavax', cmd: CMD.secondary },
  { name: 'charge-pax', player: 'pax', enemy: 'fiara', cmd: CMD.charge, meter: true },
  { name: 'dash-pax', player: 'pax', enemy: 'fiara', cmd: CMD.dash },
  { name: 'guard-pax', player: 'pax', enemy: 'fiara', cmd: CMD.guard, foeCmd: CMD.primary, hold: 20 },
  { name: 'weather-rain', player: 'curomo', enemy: 'pax', cmd: CMD.weather, charge: true },
  ...SUPER_RACES.map((r) => ({ name: `super-${r}`, player: r, enemy: r === 'pax' ? 'fiara' : 'pax', cmd: CMD.super, meter: true })),
];

test.describe('ability audit shots', () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

  for (const a of ARC) {
    test(a.name, async ({ page }) => {
      test.skip(!wanted(a.name));
      const errors = collectErrors(page);
      await arcadeVersus(page, a.player, a.enemy);
      if (a.meter === true) await page.evaluate(`window.__TTE__.arena.setMeter(0, 3000)`);
      if (a.charge === true) await page.evaluate(`window.__TTE__.arena.setWeatherCharge(0, 1000)`);
      await cast(page, a.name, a.cmd, a.foeCmd ?? 0, a.hold ?? 1);
      expect(errors).toEqual([]);
    });
  }

  // Classic: the training Dummy fights back with Stick (chapter 1), Capture needs chapter 2 or later (presets via the game master).
  test('stick', async ({ page }) => {
    test.skip(!wanted('stick'));
    // Practice: the hero fights the training Dummy. STICK_SEED picks the arena floor (the fire floor is the hard case for the pale dart).
    await page.goto(`/?manual=1&seed=${process.env['STICK_SEED'] ?? '7'}`);
    await newGameToGarrison(page);
    await startBattle(page, 'enterPracticeContainer');
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 300, 360, 0); a.place(foe.id, 480, 360, 4); a.step(1); })()`);
    for (const t of [10, 30, 60, 90]) {
      await page.evaluate(`window.__TTE__.arena.stepLive(${String(t === 10 ? 10 : 20)})`);
      await snap(page, 'stick', t);
    }
  });

  test('capture', async ({ page }) => {
    test.skip(!wanted('capture'));
    await page.goto(`${START}#gameMaster`);
    await page.getByText('Chapter 3', { exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Chapter 3 preset written.');
    await goToHash(page, '#garrison');
    await startBattle(page, 'enterBattlegroundContainer', 3);
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 300, 360, 0); a.place(foe.id, 440, 360, 4); a.setHp(foe.id, 1); a.step(1); })()`);
    await cast(page, 'capture', CMD.capture);
  });

  for (const [name, preset] of [['chaos', 'Chapter complete']] as const) {
    test(`${name} (Eternal Void boss, Classic portal)`, async ({ page }) => {
      test.skip(!wanted('chaos-bolt') && !wanted('chaos-orb'));
      await page.goto(`${START}#gameMaster`);
      await page.getByText(preset, { exact: true }).click();
      await expect(page.getByRole('status')).toHaveText(`${preset} preset written.`);
      await goToHash(page, '#garrison');
      await startBattle(page, 'enterPortalContainer', 3);
      await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 300, 360, 0); a.place(foe.id, 560, 360, 4); a.step(1); })()`);
      // The boss AI picks its own abilities; let it run and save frames over the first seconds.
      for (let i = 1; i <= 12; i++) {
        await page.evaluate(`window.__TTE__.arena.stepLive(15)`);
        await snap(page, 'chaos', i * 15);
      }
    });
  }
});
