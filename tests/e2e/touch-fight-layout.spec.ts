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
  // The card is held back until ROUND 1 / FIGHT! has cleared (FIGHT_OVER_EVENT, QA r34/r35): wait for it before the layout reads.
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
    expect(card.y + card.h).toBeLessThan(390 * 0.85); // hugs the action bar (QA r36), never over it
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
    expect(card.y + card.h).toBeLessThanOrEqual(390 * 0.85); // above the action bar, low enough to clear the fighters (QA r36)
    expect(card.y).toBeGreaterThanOrEqual(390 * 0.66);
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
    // QA r40: docked beside the stick (right of it), clear of the stick and both Strike buttons, not centred over the fight.
    const stick = await box(page, '#touchStick');
    expect(card.x).toBeGreaterThanOrEqual(stick.x + stick.w);
    for (const id of ['#touchStrike1', '#touchStrike2']) expect(overlap(card, await box(page, id)), id).toBe(false);
    expect(card.y + card.h).toBeLessThanOrEqual(375 * 0.84);
    expect(card.y).toBeGreaterThanOrEqual(375 * 0.66); // QA r36: below the fighters' feet, flush above the bar
    expect((await box(page, '#firstRunHint .firstRunDone')).h).toBeGreaterThanOrEqual(44);
  });
});

test.describe('small phone landscape, QA r38', () => {
  test.use({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('2v2: the stick sits above the action bar, not over the Blast / Flame / Tag slots', async ({ page }) => {
    await enterFight(page, 2);
    const stick = await box(page, '#touchStick');
    const canvas = await box(page, '#game canvas');
    // The slot row fills the bottom of the canvas (about 84% down, see the first-run card tests): the stick ends above it.
    expect(stick.y + stick.h).toBeLessThanOrEqual(canvas.y + canvas.h * 0.84);
    await shot(page, 'small-2v2-stick');
  });
  test('Versus picker: the You / Computer cards clear the sticky Fight! bar', async ({ page }) => {
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByRole('button', { name: /^Fight/ }).waitFor();
    const cards = await page.evaluate<{ b: number; barTop: number }>(
      `(() => { const c = [...document.querySelectorAll('#arcadePick .vsSide1, #arcadePick .vsSide2')].map((e) => e.getBoundingClientRect().bottom); const bar = document.querySelector('#arcadePick .vsActions').getBoundingClientRect(); return { b: Math.max(...c.slice(0, 2)), barTop: bar.top }; })()`,
    );
    await shot(page, 'small-picker');
    expect(cards.b).toBeLessThanOrEqual(cards.barTop + 0.5);
  });
});

test.describe('small phone landscape, QA r39', () => {
  test.use({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('2v2 picker: the partner row is above the sticky Fight! bar', async ({ page }) => {
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Team').selectOption('2');
    await page.getByRole('button', { name: /^Fight/ }).waitFor();
    const m = await page.evaluate<{ partnerBottom: number; barTop: number }>(
      `(() => { const p = document.querySelector('#arcadePick .vsSide1 .vsSlotItem:nth-child(2)').getBoundingClientRect(); return { partnerBottom: p.bottom, barTop: document.querySelector('#arcadePick .vsActions').getBoundingClientRect().top }; })()`,
    );
    await shot(page, 'small-picker-2v2');
    expect(m.partnerBottom).toBeLessThanOrEqual(m.barTop + 0.5);
  });
  test('first-run card is see-through and click-through (only Got it takes taps), and names the bar', async ({ page }) => {
    await enterFight(page);
    const m = await page.evaluate<{ pe: string; donePe: string; text: string }>(
      `(() => { const c = document.querySelector('#firstRunHint'); return { pe: getComputedStyle(c).pointerEvents, donePe: getComputedStyle(c.querySelector('.firstRunDone')).pointerEvents, text: c.textContent }; })()`,
    );
    expect(m.pe).toBe('none');
    expect(m.donePe).not.toBe('none');
    expect(m.text).toMatch(/Tap the bar/);
  });
  test('Tour stage card: "Stage N  Element" tiles, your team strip, Fight in view', async ({ page }) => {
    await page.goto(`${START}&ff=arcade#tour`);
    await page.getByLabel('Hero 1 (lead)').selectOption('fiara');
    await page.getByLabel('Hero 2').selectOption('rokcore');
    await page.getByLabel('Hero 3').selectOption('curomo');
    await page.getByRole('button', { name: 'Start tour' }).click();
    await page.locator('#tourPins li').first().waitFor();
    await page.locator('#tourStage .tsTeam').waitFor();
    await page.locator('#tourFight').waitFor();
    await page.waitForFunction("getComputedStyle(document.querySelector('#tourStage')).opacity === '1'");
    await shot(page, 'small-tour-card');
    const m = await page.evaluate<{ first: string; label: string | null; team: number; fightBottom: number; ih: number }>(
      `(() => { const li = document.querySelector('#tourPins li'); return { first: li.textContent, label: li.getAttribute('aria-label'), team: document.querySelectorAll('#tourStage .tsTeam .tsMine').length, fightBottom: document.querySelector('#tourFight').getBoundingClientRect().bottom, ih: innerHeight }; })()`,
    );
    expect(m.first).toMatch(/^Stage 1\s+\w+$/);
    expect(m.label).toMatch(/^Stage 1: /);
    expect(m.team).toBe(3);
    expect(m.fightBottom).toBeLessThanOrEqual(m.ih);
  });
});

test.describe('small phone landscape, touch attack buttons (QA r39)', () => {
  test.use({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const team of [1, 2] as const) {
    test(`${String(team)}v${String(team)}: labelled Strike 1 / Strike 2 sit bottom right, 44 px+, clear of the stick and the action bar`, async ({ page }) => {
      await enterFight(page, team);
      await page.getByRole('button', { name: 'Got it' }).tap();
      await page.evaluate(`window.__TTE__.arena.step(120)`);
      await shot(page, `small-strike-${String(team)}v${String(team)}`);
      const canvas = await box(page, '#game canvas');
      const stick = await box(page, '#touchStick');
      const s1 = await box(page, '#touchStrike1');
      const s2 = await box(page, '#touchStrike2');
      for (const b of [s1, s2]) {
        expect(b.w).toBeGreaterThanOrEqual(44);
        expect(b.h).toBeGreaterThanOrEqual(44);
        expect(b.x + b.w).toBeLessThanOrEqual(canvas.x + canvas.w);
        expect(b.x + b.w).toBeLessThanOrEqual(667 - 8); // QA r40: a margin from the right edge (plus the safe-area inset), never clipped
        expect(b.x).toBeGreaterThan(667 / 2); // the right thumb's half
        expect(overlap(b, stick)).toBe(false);
        // The slot row fills the bottom of the canvas (about 84% down): the buttons end above it.
        expect(b.y + b.h).toBeLessThanOrEqual(canvas.y + canvas.h * 0.86);
      }
      expect(overlap(s1, s2)).toBe(false);
      await expect(page.locator('#touchStrike1')).toContainText('Strike');
      await expect(page.locator('#touchStrike2')).toContainText('Strike');
      for (const id of ['#arcadeDash', '#arcadeSuper']) expect(overlap(s1, await box(page, id))).toBe(false);
    });
  }
  test('a held Strike button holds the key of the bar slot (slot 1)', async ({ page }) => {
    await enterFight(page);
    await page.getByRole('button', { name: 'Got it' }).tap();
    const down = await page.evaluate<string[]>(`(() => {
      const codes = [];
      window.addEventListener('keydown', (e) => codes.push(e.code));
      document.querySelector('#touchStrike1').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true }));
      document.querySelector('#touchStrike1').dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));
      return codes;
    })()`);
    expect(down).toContain('Digit1');
  });
  test('2v2: the life line reads as life (current/max), never a bare number', async ({ page }) => {
    await enterFight(page, 2);
    await page.getByRole('button', { name: 'Got it' }).tap();
    await page.evaluate(`window.__TTE__.arena.step(60)`);
    await shot(page, 'small-2v2-life');
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
    test('names are at least 11 CSS px, SUPER at least 9.5, and do not overlap each other', async ({ page }) => {
      await page.goto('/?manual=1&seed=7&hero=fiara&foe=treenoc');
      await page.waitForFunction(ARENA_READY);
      await page.evaluate(`window.__TTE__.arena.step(150)`);
      await shot(page, `hudtext-${String(w)}`);
      const texts = await page.evaluate<Array<Box & { text: string; px: number }>>(`window.__TTE__.arena.hudTextSizes()`);
      const names = texts.filter((t) => /FIARA|TREEN|SUPER/.test(t.text));
      expect(names.length, JSON.stringify(texts)).toBeGreaterThanOrEqual(4);
      for (const t of names.filter((n) => !/SUPER/.test(n.text))) expect(t.px, t.text).toBeGreaterThanOrEqual(11);
      for (const t of names) expect(t.px, t.text).toBeGreaterThanOrEqual(9.5);
      // The long name (TREENOC) is whole: not cut with an ellipsis, not dropped to a bare glyph.
      expect(texts.some((t) => /^TREENOC /.test(t.text) && !t.text.includes('\u2026')), JSON.stringify(texts)).toBe(true);
      // The WEATHER charge chip (weather-view.ts) reads at 10 CSS px or more and clears the HUD text.
      const chip = texts.find((t) => /WEATHER/.test(t.text));
      if (chip) {
        expect(chip.px, chip.text).toBeGreaterThanOrEqual(10);
        for (const t of names) expect(overlap(chip, t), `${chip.text} / ${t.text}`).toBe(false);
      }
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

// QA r36: the touch Pause button (top right) must not sit on the right-hand "N HITS / N DMG" counter, and the longest hero name stays whole.
for (const [w, h] of [[667, 375], [844, 390]] as const) {
  test.describe(`pause button and hit counter ${String(w)}x${String(h)}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    test('the Pause button clears the right-hand hit counter; long names are not cut', async ({ page }) => {
      await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7&hero=sindarosa&foe=treenoc');
      await page.waitForFunction(ARENA_READY);
      // Team 1 (right side) lands a Charge and a follow-up: its counter shows at the right edge, under the Pause button.
      const foe = await page.evaluate<number>(`(() => {
        const a = window.__TTE__.arena;
        a.step(91);
        const [me, foe] = a.characters();
        a.place(me.id, 700, 380, 4);
        a.place(foe.id, 780, 380, 4);
        return me.id;
      })()`);
      const hp = (): Promise<number> => page.evaluate<number>(`window.__TTE__.arena.characters().find((c) => c.id === ${String(foe)}).hp`);
      const start = await hp();
      for (let i = 0; i < 20 && (await hp()) === start; i++) await page.evaluate(`window.__TTE__.arena.step(1, [0, ${String(1 << 15)}])`);
      await page.evaluate(`window.__TTE__.arena.step(8, [0, 16])`);
      await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      await shot(page, `pause-counter-${String(w)}`);
      const texts = await page.evaluate<Array<Box & { text: string; px: number }>>(`window.__TTE__.arena.hudTextSizes()`);
      const counter = texts.find((t) => /HITS/.test(t.text));
      expect(counter, JSON.stringify(texts)).toBeDefined();
      const canvas = await box(page, '#game canvas');
      const pause = await box(page, '#pauseButton');
      // hudTextSizes boxes are canvas-relative with the origin at the text's anchor (right-aligned counter: x is its right edge).
      const c = counter as Box;
      const rect: Box = { x: canvas.x + c.x - c.w, y: canvas.y + c.y, w: c.w, h: c.h };
      expect(overlap(rect, pause), `${JSON.stringify(rect)} / ${JSON.stringify(pause)}`).toBe(false);
      for (const t of texts.filter((n) => /SINDAROSA|TREENOC/.test(n.text))) expect(t.text, t.text).not.toContain('\u2026');
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
