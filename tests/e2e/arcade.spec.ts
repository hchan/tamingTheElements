import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, SAVE_KEY, START, characters, collectErrors, fixture, goToHash, seedViaGameMaster, waitForRoute } from './parity/helpers';

// Arcade Versus (FUN-DESIGN WP 11): the Settings opt-in (the live site's way in; `?ff=` only works in dev and test
// builds), the picker, a real Arcade match against the Arcade AI (a hit, a super from the X key or the touch button, the
// KO), the results and back to the menu, with the save byte-for-byte untouched. Page-side code is passed as strings
// because tsconfig.node has no DOM lib; `manual=1` starts the arena paused so every tick is stepped.
/** Client-px test: ids of `#game` buttons that intersect the walkable playfield (arcadePlayfield: y 200..640 of 720, via the canvas box). */
async function overlapsArena(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(`(() => {
    const c = document.querySelector('#game canvas').getBoundingClientRect();
    const k = c.height / 720;
    const top = c.top + 200 * k, bottom = c.top + 640 * k;
    return [...document.querySelectorAll('#game button[id^="arcade"]')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.right > c.left && r.left < c.right && r.bottom > top && r.top < bottom;
    }).map((b) => b.id);
  })()`);
}

test('desktop 1280x720: the Arcade touch buttons stay clickable but never overlap the walkable playfield (2v2 and 3v3)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const [size, buttons] of [['2', 6], ['3', 7]] as const) {
    await page.goto('about:blank');
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Team').selectOption(size);
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    await expect(page.locator('#arcadeTag')).toBeVisible();
    expect(await page.locator('#game button[id^="arcade"]').count()).toBe(buttons);
    expect(await overlapsArena(page)).toEqual([]);
  }
});

const PRIMARY = 1 << 4;
const SUPER = 1 << 13;
/**
 * Rounds (FUN-DESIGN 2.10, best of 3): round 1's intro holds everyone until tick 91; after a KO the 30-tick KO stop and
 * the 120-tick KO phase, the 60-tick round end, then the next 90-tick intro (or the match end).
 */
const INTRO = 91;
const KO_TO_ROUND_END = 30 + 120 + 60;
const MENU = ['Play', 'Versus', 'Online', 'Settings', 'Help'];

async function audit(page: Page, name: string): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze();
  const bad = result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${String(v.impact)}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  expect(bad, `${name}: ${bad.join('\n')}`).toEqual([]);
}

const menuLabels = (page: Page): Promise<string[]> => page.locator('#menu .mainMenuList li button').allInnerTexts();
const savedText = (page: Page): Promise<string | null> => page.evaluate<string | null>(`window.localStorage.getItem(${JSON.stringify(SAVE_KEY)})`);
const superName = (page: Page): Promise<string | undefined> =>
  page.evaluate<string | undefined>(`window.__TTE__.arena.superFx().then((f) => f && f.name)`);

/** Picks the races and level on the picker and starts the fight; resolves with the paused Arcade arena. */
async function fight(page: Page, player: string, enemy: string, level = 'normal'): Promise<void> {
  await page.getByLabel('Your race').selectOption(player);
  await page.getByLabel('AI race').selectOption(enemy);
  await page.getByLabel('AI level').selectOption(level);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
}

/** Player at the left facing east, the AI on the same row; returns their ids. */
async function lineUp(page: Page, foeX: number): Promise<{ me: number; foe: number }> {
  const [me] = await characters(page, 0);
  const [foe] = await characters(page, 1);
  if (!me || !foe) throw new Error('both fighters must be in the arena');
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.place(${String(me.id)}, 300, 360, 0); a.place(${String(foe.id)}, ${String(foeX)}, 360, 4); })()`);
  return { me: me.id, foe: foe.id };
}

/** Full meter for the player and a one-hit foe, so the super ends the match. */
async function primeSuper(page: Page, foe: number): Promise<void> {
  await lineUp(page, 900);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setMeter(0, 1000); a.setHp(${String(foe)}, 1); })()`);
}

/**
 * The super plays out and KOs the foe: round 1. Round 2 starts with both fighters reset to full health; a forced super
 * KOs the foe again, and after that round end the results (2-0) replace the arena.
 */
async function finishOnResults(page: Page): Promise<void> {
  await expect.poll(() => superName(page)).toMatch(/^(HELLFIRE LANCE|PHOENIX RISE)$/);
  const [full] = await characters(page, 1);
  await page.evaluate(`window.__TTE__.arena.step(${String(90 + KO_TO_ROUND_END + INTRO)})`);
  await expect(page.getByRole('heading', { level: 1, name: 'Victory!' })).toHaveCount(0);
  const [reset] = await characters(page, 1);
  expect(reset?.hp).toBe(reset?.maxHp);
  expect(reset?.hp).toBeGreaterThan(full?.hp ?? 0);
  await primeSuper(page, reset?.id ?? -1);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(1, [${String(SUPER)}, 0]); a.step(${String(90 + KO_TO_ROUND_END)}); })()`);
  await expect(page.getByRole('heading', { level: 1, name: 'Victory!' })).toBeVisible();
  await expect(page.locator('#arcadeResults')).toContainText('Rounds 2-0.');
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
}

test('on by default: the menu has the five entries Play, Versus, Online, Settings, Help; no Settings toggle; #arcade opens', async ({ page }) => {
  const errors = collectErrors(page);
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await goToHash(page, '#main');
  expect(await menuLabels(page)).toEqual(MENU);
  await expect(page.locator('#menu .mainMenuList li button').first()).toHaveText('Play');
  await page.evaluate(`window.location.hash = '#arcade'`);
  await waitForRoute(page, '#arcade');
  await expect(page.locator('#arcadePick')).toHaveCount(1);
  await goToHash(page, '#settings');
  await expect(page.getByLabel('Arcade Versus (preview)')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Arcade Versus from the menu: a hit, a super with X, KO, round 2, results 2-0, rematch, back to the menu; the save is untouched', async ({ page }) => {
  const errors = collectErrors(page);
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await goToHash(page, '#main');
  expect(await menuLabels(page)).toEqual(MENU);
  const before = await savedText(page);
  expect(JSON.parse(before ?? '{}')).toMatchObject({ chapter: 3 });

  await page.getByRole('button', { name: 'Versus', exact: true }).click();
  await waitForRoute(page, '#arcade');
  await expect(page.getByRole('heading', { level: 1, name: 'Versus', exact: true })).toBeFocused();
  await audit(page, 'Arcade Versus picker');
  await fight(page, 'sindarosa', 'pax');

  // A hit: Fire Blast along the row (forced commands, so the AI stands still for it).
  const { foe } = await lineUp(page, 600);
  const [full] = await characters(page, 1);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.step(1, [${String(PRIMARY)}, 0]); a.step(60); })()`);
  const [hurt] = await characters(page, 1);
  expect(hurt?.hp ?? 0).toBeLessThan(full?.hp ?? 0);

  // The super from the keyboard: X held for two live ticks (the keyboard agent reads it, the AI plays on).
  await primeSuper(page, foe);
  await page.keyboard.down('KeyX');
  await page.evaluate(`window.__TTE__.arena.stepLive(2)`);
  await page.keyboard.up('KeyX');
  await finishOnResults(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Victory!' })).toBeFocused();
  await expect(page.locator('#arcadeResults')).toContainText('Rounds 2-0');
  await audit(page, 'Arcade Versus results');

  // Rematch starts a fresh arena with the same fighters; the pause dialog leads back to the menu.
  await page.getByRole('button', { name: 'Rematch' }).click();
  await page.waitForFunction(ARENA_READY);
  expect((await characters(page, 1))[0]?.hp).toBe(full?.hp);
  // `manual=1` holds the arena with the user pause reason, so the first Shift+P resumes it and the second opens the dialog.
  await page.keyboard.press('Shift+P');
  await page.waitForFunction(`window.__TTE__.arena.paused === false`);
  await page.keyboard.press('Shift+P');
  await page.getByRole('link', { name: 'Exit to menu' }).click();
  await waitForRoute(page, '#main');
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  expect(await savedText(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('?ff=arcade (dev and test builds) without a save: Escape leaves the picker, the touch Super button, results Main Menu', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade`);
  await page.getByRole('button', { name: 'Versus', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Versus', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await waitForRoute(page, '#main');

  await page.getByRole('button', { name: 'Versus', exact: true }).click();
  await fight(page, 'fiara', 'curomo', 'easy');
  const [foe] = await characters(page, 1);
  await primeSuper(page, foe?.id ?? -1);
  // A press on the Super button holds the bound super key while the finger (here the mouse) is down.
  const button = page.locator('#arcadeSuper');
  await expect(button).toBeVisible();
  await button.hover();
  await page.mouse.down();
  await page.evaluate(`window.__TTE__.arena.stepLive(2)`);
  await page.mouse.up();
  await finishOnResults(page);
  await page.getByRole('link', { name: 'Main Menu' }).click();
  await waitForRoute(page, '#main');
  expect(await savedText(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('8-way aim: the arrow follows the held diagonal, stays after release, and Fire Blast flies that way', async ({ page }, info) => {
  const UP = 1;
  const RIGHT = 8;
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: 'Fight!' }).waitFor();
  await fight(page, 'sindarosa', 'pax');
  const { foe } = await lineUp(page, 1000);
  type Aim = { visible: boolean; x: number; y: number; angle: number } | undefined;
  const frames = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;
  const aim = async (): Promise<Aim> => {
    await page.evaluate(frames);
    return page.evaluate<Aim>(`window.__TTE__.arena.aim()`);
  };
  // Before any input: the 4-way facing (east), right of the player.
  const east = await aim();
  expect(east).toMatchObject({ visible: true, angle: 0 });
  // Up + right held: north-east (Phaser reports 315 degrees as -45), up and right of the character's centre.
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(UP | RIGHT)}, 0])`);
  const ne = await aim();
  const [me] = await page.evaluate<{ x: number; y: number }[]>(`window.__TTE__.arena.characters().filter((c) => c.team === 0)`);
  expect(ne).toMatchObject({ visible: true, angle: -45 });
  const cx = (me?.x ?? 0) + 40;
  const cy = (me?.y ?? 0) + 40;
  const d = 64 * Math.SQRT1_2;
  // The arrow is drawn with the sprite's interpolation (between the last two ticks: 7 px apart).
  expect(Math.abs((ne?.x ?? 0) - (cx + d))).toBeLessThanOrEqual(8);
  expect(Math.abs((ne?.y ?? 0) - (cy - d))).toBeLessThanOrEqual(8);
  await info.attach('arcade-aim-ne', { body: await page.locator('#game canvas').screenshot(), contentType: 'image/png' });
  // Released: the aim stays north-east, and a shot from here misses the foe on the row (it flies up and right).
  await page.evaluate(`window.__TTE__.arena.step(1, [${String(PRIMARY)}, 0])`);
  expect(await aim()).toMatchObject({ visible: true, angle: -45 });
  const [before] = await characters(page, 1);
  await page.evaluate(`window.__TTE__.arena.step(80)`);
  expect((await characters(page, 1)).find((c) => c.id === foe)?.hp).toBe(before?.hp);
  expect(errors).toEqual([]);
});

test.describe('390x844 portrait phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the picker fits without horizontal scrolling and its controls are 44 px touch targets', async ({ page }) => {
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByRole('button', { name: 'Fight!' }).waitFor();
    expect(await page.evaluate<boolean>(`document.documentElement.scrollWidth <= window.innerWidth`)).toBe(true);
    for (const label of ['Your race', 'AI race', 'AI level']) {
      const box = await page.getByLabel(label).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    const fightBox = await page.getByRole('button', { name: 'Fight!' }).boundingBox();
    expect(fightBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
