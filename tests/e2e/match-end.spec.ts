import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters } from './parity/helpers';

// The Versus match-end beat (QA r90 P2): winner portrait and name, the result word, the stat chip and the buttons, reachable at
// desktop and phone size. Reaches the results with two forced super KOs (as arcade.spec does); `manual=1` holds the arena.
const SUPER = 1 << 13;
const INTRO = 71;
const KO_TO_ROUND_END = 30 + 120 + 60;

/** `win` KOs the foe, `lose` KOs the player. */
async function koRound(page: Page, side: 'win' | 'lose' = 'win'): Promise<void> {
  const [me] = await characters(page, 0);
  const [foe] = await characters(page, 1);
  if (!me || !foe) throw new Error('both fighters must be in the arena');
  const [, victim, team, inputs] = side === 'win' ? [0, foe, 0, `[${String(SUPER)}, 0]`] : [1, me, 1, `[0, ${String(SUPER)}]`];
  const places = side === 'win' ? ['300, 360, 0', '900, 360, 4'] : ['900, 360, 4', '300, 360, 0'];
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.place(${String(me.id)}, ${String(places[0])}); a.place(${String(foe.id)}, ${String(places[1])}); a.setMeter(${String(team)}, 1000); a.setHp(${String(victim.id)}, ${side === 'win' ? '1' : '0'}); a.step(1, ${inputs}); a.step(${String(90 + KO_TO_ROUND_END)}); })()`);
}
const koFoe = (page: Page): Promise<void> => koRound(page, 'win');

const SIZES = [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 360, height: 640 }];
async function fightTo(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('sindarosa');
  await page.getByLabel('AI race').selectOption('pax');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
}

/** No name wraps mid-word (every line break sits at a space) and, on phones, the hero tiles share one top edge. */
async function expectNamesAndTilesClean(page: Page): Promise<void> {
  const res = await page.evaluate<{ text: string; broken: boolean }[]>(`(() => [...document.querySelectorAll('#arcadeResults .matchEndName')].map((p) => {
    const node = p.firstChild; const text = node.textContent; let pos = 0; let broken = false;
    for (const w of text.split(' ')) {
      if (w.length > 0) { const r = document.createRange(); r.setStart(node, pos); r.setEnd(node, pos + w.length); if (r.getClientRects().length > 1) broken = true; }
      pos += w.length + 1;
    }
    return { text, broken };
  }))()`);
  expect(res.length).toBeGreaterThan(0);
  for (const r of res) expect(r.broken, `"${r.text}" wraps mid-word`).toBe(false);
  // Phone: the two equal-size tiles share a top edge (desktop deliberately pairs a large winner tile with a small foe tile).
  if ((page.viewportSize()?.width ?? 0) > 480) return;
  const tops = await page.evaluate<number[]>(`[...document.querySelectorAll('#arcadeResults .matchEndFace')].map((f) => Math.round(f.getBoundingClientRect().top))`);
  expect(new Set(tops).size, `hero tiles share a top edge: ${tops.join(',')}`).toBe(1);
}

for (const size of SIZES) {
  for (const [side, heading] of [['lose', 'Defeat']] as const) {
    test(`match end ${side} at ${String(size.width)}: own hero large, foe beside it`, async ({ page }) => {
      await fightTo(page, size);
      await koRound(page, side);
      await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
      await koRound(page, side);
      const results = page.locator('#arcadeResults');
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(results.locator('.matchEndMain .matchEndName').first()).toContainText('Sindarosa');
      await expect(results.locator('.matchEndName')).toHaveCount(2);
      await expectNamesAndTilesClean(page);
      const dir = process.env['SHOT_DIR'];
      if (dir) await page.screenshot({ path: `${dir}/match-end-${side}-${String(size.width)}.png` });
    });
  }
}

// Local two-player Versus: the ribbon names the winning player; Player 2 gets a distinct icon.
async function fightLocal(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Opponent').selectOption('local');
  await page.getByLabel('Team').selectOption('1');
  await page.getByLabel('Player 1 hero 1').selectOption('sindarosa');
  await page.getByLabel('Player 2 hero 1').selectOption('pax');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
}

for (const size of SIZES) {
  for (const side of ['win', 'lose'] as const) {
    test(`local match end ${side} at ${String(size.width)}: names the winning player`, async ({ page }) => {
      await fightLocal(page, size);
      await koRound(page, side);
      await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
      await koRound(page, side);
      const n = side === 'win' ? '1' : '2';
      const results = page.locator('#arcadeResults');
      await expect(page.getByRole('heading', { level: 1, name: `Player ${n} wins!` })).toBeVisible();
      await expect(results.locator('.matchEndRibbon')).toHaveText(`${side === 'win' ? '★' : '◆'}P${n} Winner`);
      await expect(results).toHaveAttribute('data-player', n);
      await expect(results.locator('.matchEndMain .matchEndName').first()).toContainText(side === 'win' ? 'Sindarosa' : 'Pax');
      const dir = process.env['SHOT_DIR'];
      if (dir) await page.screenshot({ path: `${dir}/match-end-local-p${n}-${String(size.width)}.png` });
    });
  }
}

/** Both fighters at 0 HP on the same tick: a double KO, so the round is a draw. */
async function koBoth(page: Page, ids: readonly number[]): Promise<void> {
  const sets = ids.map((id) => `a.setHp(${String(id)}, 0);`).join(' ');
  await page.evaluate(`(() => { const a = window.__TTE__.arena; ${sets} a.step(${String(90 + KO_TO_ROUND_END)}); })()`);
}

for (const size of SIZES) {
  test(`match end draw at ${String(size.width)}: neutral ribbon, one DRAW cue`, async ({ page }) => {
    await fightTo(page, size);
    const ids = [...(await characters(page, 0)), ...(await characters(page, 1))].map((c) => c.id);
    for (let i = 0; i < 6 && (await page.locator('#arcadeResults').count()) === 0; i++) {
      await koBoth(page, ids);
      await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
    }
    const results = page.locator('#arcadeResults');
    await expect(results).toHaveAttribute('data-tone', 'draw');
    await expect(results.locator('.matchEndRibbon')).toHaveText('≡No winner');
    await expect(page.getByRole('heading', { level: 1, name: 'Draw' })).toBeVisible();
    const dir = process.env['SHOT_DIR'];
    if (dir) await page.screenshot({ path: `${dir}/match-end-draw-${String(size.width)}.png` });
  });
}

for (const size of SIZES) {
  test(`match end at ${String(size.width)}x${String(size.height)}: winner, result word, reachable buttons`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Your race').selectOption('sindarosa');
    await page.getByLabel('AI race').selectOption('pax');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
    await koFoe(page);
    await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
    await koFoe(page);
    const results = page.locator('#arcadeResults');
    await expect(page.getByRole('heading', { level: 1, name: 'Victory!' })).toBeVisible();
    await expect(results.locator('.matchEndName').first()).toContainText('Sindarosa');
    await expect(results.locator('.matchEndStats')).toContainText('Rounds 2-0');
    await expectNamesAndTilesClean(page);
    const dir = process.env['SHOT_DIR'];
    if (dir) await page.screenshot({ path: `${dir}/match-end-win-${String(size.width)}.png` });
    for (const sel of ['#arcadeRematch', '#arcadeChange', 'a.menuButton']) {
      const box = await results.locator(sel).boundingBox();
      expect(box, sel).not.toBeNull();
      expect(box?.height ?? 0, sel).toBeGreaterThanOrEqual(44);
      expect((box?.y ?? 0) + (box?.height ?? 0), `${sel} is on screen`).toBeLessThanOrEqual(size.height);
    }
  });
}

test('local P2 winner card at 360x640 keeps every button above the fold', async ({ page }) => {
  const size = { width: 360, height: 640 };
  await fightLocal(page, size);
  await koRound(page, 'lose');
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
  await koRound(page, 'lose');
  const results = page.locator('#arcadeResults');
  await expect(results).toHaveAttribute('data-player', '2');
  for (const sel of ['#arcadeRematch', '#arcadeChange', 'a.menuButton']) {
    const box = await results.locator(sel).boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0), `${sel} is on screen`).toBeLessThanOrEqual(size.height);
  }
});
