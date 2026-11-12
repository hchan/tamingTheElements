import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

// Page-side code is passed as strings because tsconfig.node has no DOM lib.
export const ARENA_READY = `window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena && window.__TTE__.arena.viewsReady()`;
export const SAVE_KEY = 'Taming the Elements';
export const BACKUP_KEY = 'Taming the Elements.v0.bak';
/** Manual stepping (battle starts paused) and a fixed seed for the opponent draw and the sim. */
export const START = '/?manual=1&seed=7';

export interface Garrison {
  readonly id: string;
  experience: number;
  readonly characterName: string;
}
export interface Save {
  schemaVersion?: number;
  chapter: number;
  difficulty: number | string;
  garrison: Garrison[];
  params?: unknown;
  reduceMotion?: boolean;
  highContrast?: boolean;
  keyBindings?: Record<string, string[]>;
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export function fixtureText(name: string): string {
  return readFileSync(new URL(`../../fixtures/legacy/saves/${name}.json`, import.meta.url), 'utf8');
}

export function fixture(name: string): Save {
  return JSON.parse(fixtureText(name)) as Save;
}

/** Seeds a save through the dev/test-only game master route (it migrates v0 to v1 on apply). */
export async function seedViaGameMaster(page: Page, save: unknown): Promise<void> {
  await page.goto(`${START}#gameMaster`);
  await page.locator('#gameMasterTextArea').fill(JSON.stringify(save));
  await page.getByText('Apply JSON', { exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Save written.');
}

export async function storedSave(page: Page): Promise<Save> {
  const text = await page.evaluate<string | null>(`window.localStorage.getItem(${JSON.stringify(SAVE_KEY)})`);
  expect(text).not.toBeNull();
  return JSON.parse(text as string) as Save;
}

/** Waits until the screen for `hash` has mounted (not merely until the hash changed, which precedes the mount). */
export async function waitForRoute(page: Page, hash: string): Promise<void> {
  await page.waitForFunction(`window.__TTE__.state().mountedRoute === ${JSON.stringify(hash)}`);
}

/** Waits for the test hook and a mounted route (the app booted, not merely the document loaded). */
export async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(`window.__TTE__ && window.__TTE__.ready === true`);
}

/** `page.goto` + `waitForReady`: use instead of a bare goto so the first click never races the boot. */
export async function gotoReady(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForReady(page);
}

export async function goToHash(page: Page, hash: string): Promise<void> {
  await page.evaluate(`window.location.hash = ${JSON.stringify(hash)}`);
  await waitForRoute(page, hash);
}

/** Selects the first `count` garrison rows, presses the mode button and waits for the paused arena. */
export async function startBattle(
  page: Page,
  mode: 'enterBattlegroundContainer' | 'enterPracticeContainer' | 'enterPortalContainer',
  count = 1,
): Promise<void> {
  await goToHash(page, '#garrison');
  const rows = page.locator('#garrisonTable .garrisonRow');
  for (let i = 0; i < count; i++) await rows.nth(i).click();
  await page.locator(`#${mode}`).click();
  // Arena load can be slow when the machine is busy; 30 s flaked twice under load.
  await page.waitForFunction(ARENA_READY, undefined, { timeout: 60_000 });
}

export interface Chr {
  id: number;
  team: number;
  hp: number;
  maxHp: number;
}

export async function characters(page: Page, team?: number): Promise<Chr[]> {
  const cs = await page.evaluate<Chr[]>(`window.__TTE__.arena.characters()`);
  return team === undefined ? cs : cs.filter((c) => c.team === team);
}

/** Kills the single active enemy and steps one tick so the sim emits MatchEnded. */
export async function killEnemy(page: Page): Promise<void> {
  const [enemy] = await characters(page, 1);
  expect(enemy).toBeDefined();
  await page.evaluate(`window.__TTE__.arena.setHp(${String(enemy?.id)}, 0); window.__TTE__.arena.step(1)`);
}

export const CINEMATIC_READY = `window.__TTE__ && window.__TTE__.scene === 'Cinematic' && !!window.__TTE__.cinematic`;

/** Waits for the running Cinematic scene and presses Skip. */
export async function skipCinematic(page: Page): Promise<void> {
  await page.waitForFunction(CINEMATIC_READY);
  await page.evaluate(`window.__TTE__.cinematic.skip()`);
}

/** Main menu -> New Game -> intro cinematic -> Skip -> garrison (the cinematic game is torn down first). */
export async function newGameToGarrison(page: Page): Promise<void> {
  await page.evaluate(`window.location.hash = '#newGame'`);
  await skipCinematic(page);
  await waitForRoute(page, '#garrison');
  await page.evaluate(`window.__TTE__.settled()`);
}

/** Exits the battle to the menu and waits for the Phaser teardown. */
export async function leaveBattle(page: Page): Promise<void> {
  await page.evaluate(`window.location.hash = '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
}
