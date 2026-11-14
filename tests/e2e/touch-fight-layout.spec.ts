import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters } from './parity/helpers';

// Touch fight screen: the first-run card, the stick and the arena on phone viewports. Shots go to $SHOT_DIR when set (before/after review).
const shotDir = process.env['SHOT_DIR'];

async function enterFight(page: Page, team = 1, click = false): Promise<void> {
  // The first-run card times itself out on a wall-clock setTimeout(2500) from arena create. On a loaded machine the layout reads,
  // shots and the tap can take longer than that: the card is then already faded (pointer-events none) and the Got it tap never lands.
  // Stretch only that one timer so these tests see the card until they dismiss it (the timeout itself is covered in first-run-hint.dom.test.ts).
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
  const fight = page.getByRole('button', { name: /^Fight/ });
  if (click) await fight.click();
  else await fight.tap();
  await page.waitForFunction(ARENA_READY);
  // The card is held back until ROUND 1 / FIGHT! has cleared (INTRO_HOLD_MS, QA r34): wait for it before the layout reads.
  await page.locator('#firstRunHint:not(.firstRunWait)').waitFor({ state: 'attached', timeout: 20000 });
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Page-space box of a selector (DOM only, so it holds for any canvas resolution). */
const box = (page: Page, sel: string): Promise<Box> =>
  page.evaluate<Box>(`(() => {
    const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function shot(page: Page, name: string): Promise<void> {
  if (shotDir) await page.screenshot({ path: `${shotDir}/${name}.png` });
}

test.describe('phone landscape fight', () => {
  test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('card clears the stick and the action bar; Got it is tappable', async ({ page }) => {
    await enterFight(page);
    await shot(page, 'land-card');
    const card = await box(page, '#firstRunHint');
    const stick = await box(page, '#touchStick');
    expect(overlap(card, stick)).toBe(false);
    expect(card.y + card.h).toBeLessThan(390 * 0.8); // above the TAG caption and the action bar
    await page.getByRole('button', { name: 'Got it' }).tap();
    await expect(page.locator('#firstRunHint')).toHaveCount(0);
    await shot(page, 'land-clear');
    await page.evaluate(`window.__TTE__.arena.step(120)`);
    await shot(page, 'land-hud');
  });
  test('the first-run card is docked under the fighters, so the name banners and ROUND stay clear (QA r31)', async ({ page }) => {
    await enterFight(page);
    const card = await box(page, '#firstRunHint');
    expect(card.y).toBeGreaterThanOrEqual(390 * 0.58); // below the name banners, ROUND 1 and the fighters' feet
    expect(card.y + card.h).toBeLessThanOrEqual(390 * 0.82); // above the action bar
  });
  test('the first-run card sits between the fighters and is narrow enough to clear both feet (QA r33)', async ({ page }) => {
    await enterFight(page);
    const card = await box(page, '#firstRunHint');
    expect(card.w).toBeLessThanOrEqual(844 * 0.4);
    const done = await box(page, '#firstRunHint .firstRunDone');
    expect(done.h).toBeGreaterThanOrEqual(44);
  });
  test('the arena fills the screen width (no side bars, QA r19)', async ({ page }) => {
    await enterFight(page);
    const game = await box(page, '#game');
    const canvas = await box(page, '#game canvas');
    expect(Math.abs(canvas.w - game.w)).toBeLessThanOrEqual(1);
    expect(Math.abs(canvas.x - game.x)).toBeLessThanOrEqual(1);
    // The HUD keeps its 1280x720 size: centred in the wider canvas, so the action bar overlays stay inside the canvas.
    await expect(page.locator('#arcadeDash')).toBeVisible();
    for (const id of ['#arcadeDash', '#arcadeSuper']) {
      const slot = await box(page, id);
      expect(slot.x).toBeGreaterThanOrEqual(canvas.x);
      expect(slot.x + slot.w).toBeLessThanOrEqual(canvas.x + canvas.w);
      expect(slot.y + slot.h).toBeLessThanOrEqual(canvas.y + canvas.h + 1);
    }
  });
  test('the round card on a phone is the short one, with stat lines (QA r28)', async ({ page }) => {
    await enterFight(page);
    await page.getByRole('button', { name: 'Got it' }).tap();
    await page.evaluate(`window.__TTE__.arena.step(101)`);
    const [foe] = await characters(page, 1);
    await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setHp(${String(foe?.id)}, 0); a.step(1); })()`);
    await page.evaluate(`window.__TTE__.arena.step(150)`);
    const r = await page.evaluate<{ result: { visible: boolean; compact: boolean; short: boolean; lines: string[] } }>(`window.__TTE__.arena.rounds()`);
    expect(r.result.visible).toBe(true);
    expect(r.result.compact).toBe(true);
    expect(r.result.short).toBe(true);
    expect(r.result.lines[0]).toMatch(/^HEALTH LEFT/);
    await shot(page, 'land-result');
  });
  test('2v2 card', async ({ page }) => {
    await enterFight(page, 2);
    await shot(page, 'land-2v2-card');
    await page.getByRole('button', { name: 'Got it' }).tap();
    await page.evaluate(`window.__TTE__.arena.step(120)`);
    await shot(page, 'land-2v2-hud');
  });
});

test.describe('small phone landscape fight', () => {
  test.use({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('the first-run card is narrow, above the action bar, with a 44 px Got it (QA r33)', async ({ page }) => {
    await enterFight(page);
    await shot(page, 'small-land-card');
    const card = await box(page, '#firstRunHint');
    expect(card.w).toBeLessThanOrEqual(667 * 0.4);
    expect(card.y + card.h).toBeLessThanOrEqual(375 * 0.84);
    expect((await box(page, '#firstRunHint .firstRunDone')).h).toBeGreaterThanOrEqual(44);
  });
});

test.describe('phone portrait fight', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('portrait: card sits under the canvas, clear of the stick', async ({ page }) => {
    await enterFight(page);
    await shot(page, 'port-rotate');
    await page.getByRole('button', { name: 'Play in portrait anyway' }).tap();
    await shot(page, 'port-play');
    const card = await box(page, '#firstRunHint');
    const stick = await box(page, '#touchStick');
    const canvas = await box(page, 'canvas');
    expect(overlap(card, stick)).toBe(false);
    expect(card.y).toBeGreaterThanOrEqual(canvas.y + canvas.h);
    await page.getByRole('button', { name: 'Got it' }).tap();
    await expect(page.locator('#firstRunHint')).toHaveCount(0);
    await shot(page, 'port-clear');
  });
  test('portrait 2v2', async ({ page }) => {
    await enterFight(page, 2);
    await shot(page, 'port-2v2-rotate');
  });
});

// Phone HUD text size (QA r3/r21): the fighter names, life numbers and SUPER labels stay readable (about 10 CSS px) and clear of each other.
for (const [w, h] of [[667, 375], [844, 390]] as const) {
  test.describe(`phone HUD text ${String(w)}x${String(h)}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    test('names and life text are at least 9.5 CSS px and do not overlap each other', async ({ page }) => {
      await page.goto('/?manual=1&seed=7&hero=fiara&foe=treenoc');
      await page.waitForFunction(ARENA_READY);
      await page.evaluate(`window.__TTE__.arena.step(150)`);
      await shot(page, `hudtext-${String(w)}`);
      const texts = await page.evaluate<Array<Box & { text: string; px: number }>>(`window.__TTE__.arena.hudTextSizes()`);
      const names = texts.filter((t) => /FIARA|TREEN|SUPER/.test(t.text));
      expect(names.length, JSON.stringify(texts)).toBeGreaterThanOrEqual(4);
      for (const t of names) expect(t.px, t.text).toBeGreaterThanOrEqual(9.5);
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const a = names[i];
          const b = names[j];
          if (a && b) expect(overlap(a, b), `${a.text} / ${b.text}`).toBe(false);
        }
      }
    });
  });
}

test.describe('desktop fight HUD shots', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  for (const team of [1, 2]) {
    test(`${String(team)}v${String(team)} HUD`, async ({ page }) => {
      await enterFight(page, team, true);
      await page.evaluate(`window.__TTE__.arena.step(120)`);
      await shot(page, `desk-${String(team)}v${String(team)}-hud`);
    });
  }
});
