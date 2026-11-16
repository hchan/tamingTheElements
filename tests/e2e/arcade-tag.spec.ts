import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters, collectErrors } from './parity/helpers';

// Arcade 2v2 tag team view and UI (WP-arcade-tag-view, FUN-DESIGN 2.6 and section 3): the picker's team size and partner
// (keyboard order, the partner disabled in 1v1), a 2v2 Arcade Versus match with the team HUD (who is in, the bench with
// its HP and red life, the tag cooldown), a tag on the 3 key and on the touch Tag button (the "TAG!" call, the entrance
// flash, the live line), a KO entrance through the test probe, the match end with both heroes on the results, 0
// listeners after leaving and the Classic menu unchanged; 3v3 (WP-arcade-3v3) with two BENCH lines and Tag 2. Page-side code is passed as strings because tsconfig.node has
// no DOM lib; `manual=1` starts the arena paused, and the effects run on the view tick, so they hold between steps.

interface Tag {
  lines: string[][];
  call: string;
  callScale: number;
  callSpan: [number, number];
  callBox: { x: number; y: number; w: number; h: number; headX: number; headY: number };
  flashes: number;
  ko: boolean;
}

/** Round 1's intro (FUN-DESIGN 2.10): nobody acts until tick 91. */
const INTRO = 91;
const KO_TO_ROUND_END = 30 + 120 + 60;
const MENU = ['Play', 'Versus', 'Online', 'Settings', 'Help'];

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
const tag = async (page: Page): Promise<Tag | undefined> => {
  await frames(page);
  return page.evaluate<Tag | undefined>(`window.__TTE__.arena.tag()`);
};
const step = (page: Page, n: number): Promise<unknown> => page.evaluate(`window.__TTE__.arena.step(${String(n)})`);
const live = (page: Page): Promise<string> =>
  page.evaluate<string>(`[document.getElementById('liveRegion'), document.getElementById('liveRegionAssertive')].map((n) => n ? n.textContent : '').join(' | ')`);
const focusedId = (page: Page): Promise<string> => page.evaluate<string>(`document.activeElement ? document.activeElement.id : ''`);

/** The picker in 2v2: Sindarosa and Pax against the AI's Fiara (its partner from seed 7); the arena after the intro. */
async function fight2v2(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Team').selectOption('2');
  await page.getByLabel('Your race').selectOption('sindarosa');
  await page.getByLabel('Your partner (2v2)').selectOption('pax');
  await page.getByLabel('AI race').selectOption('fiara');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await step(page, INTRO);
}

test('picker: Team first, the partner only in 2v2 (disabled and out of the Tab order in 1v1)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  const partner = page.getByLabel('Your partner (2v2)');
  await expect(page.getByLabel('Team')).toHaveValue('1');
  await expect(partner).toBeDisabled();
  // Heroes are chosen on the roster (slot buttons and a tile grid); the hero pulldowns stay in the form but are out of the Tab order.
  await page.getByLabel('Team').focus();
  const order: string[] = [];
  for (let i = 0; i < 6; i++) {
    order.push(await focusedId(page));
    await page.keyboard.press('Tab');
  }
  // The Level, Arena and next pulldowns are segmented controls (one unnamed tab stop per group) over hidden selects.
  expect(order).toEqual(['arcadeSize', '', '', '', 'roster-player', 'roster-enemy']);
  await expect(page.locator('#roster-partner')).toBeHidden();
  await page.getByLabel('Team').selectOption('2');
  await expect(partner).toBeEnabled();
  await expect(page.locator('#roster-partner')).toBeVisible();
  // One click fills the active slot (Your race) and moves on to the next one (Your partner) (01532fcb: no preview step).
  await page.getByRole('button', { name: /^Pax/ }).click();
  await expect(page.getByLabel('Your race')).toHaveValue('pax');
  await expect(page.locator('#roster-partner')).toHaveAttribute('aria-pressed', 'true');
  // A partner equal to the lead is replaced (two distinct races a side).
  await page.getByLabel('Your race').selectOption('pax');
  await page.getByLabel('Your partner (2v2)').selectOption('pax');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  expect(await characters(page)).toHaveLength(2); // the benched heroes are not listed
  const t = await tag(page);
  expect(t?.lines[0]?.[0]).toBe('IN Pax');
  expect(t?.lines[0]?.[1]).not.toContain('Pax');
  expect(errors).toEqual([]);
});

test('2v2: team HUD, tag on 3 and the touch Tag button, KO entrance, results with both heroes; 0 listeners after', async ({ page }) => {
  const errors = collectErrors(page);
  await fight2v2(page);
  await expect(page.locator('#arcadeTag')).toBeVisible();
  const start = await tag(page);
  expect(start).not.toHaveProperty('caption');
  expect(start?.lines[0]).toEqual(['IN Sindarosa', expect.stringMatching(/^BENCH Pax [▲≈■●◆] 100%$/), 'TAG READY']);
  expect(start?.lines[1]?.[0]).toBe('IN Fiara');
  expect(start?.lines[1]?.[1]).toMatch(/^BENCH \S+ [▲≈■●◆] 100%$/);
  // Red life: Sindarosa hurt, then benched by a tag on the 3 key (live ticks: the keyboard agent plays the player).
  // A tag pressed during FIGHT! is not swallowed: the call waits for the banner at most BANNER_WAIT_TICKS (15 view ticks), then plays in full.
  const [lead] = await characters(page, 0);
  await page.evaluate(`window.__TTE__.arena.setHp(${String(lead?.id)}, ${String(Math.round((lead?.maxHp ?? 0) * 0.4))})`);
  await page.keyboard.down('Digit3');
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.keyboard.up('Digit3');
  const tagged = await tag(page);
  expect(tagged).toMatchObject({ call: 'TAG!', flashes: 1, ko: false });
  expect(tagged?.callScale).toBeGreaterThan(1);
  // WP-HF1: the call sits over the drawn head (never on it) and under the top bar's chips.
  const box = tagged?.callBox;
  expect(box?.w).toBeGreaterThan(0);
  expect((box?.y ?? 0)).toBeGreaterThanOrEqual(130);
  expect((box?.y ?? 0) + (box?.h ?? 0)).toBeLessThanOrEqual(Math.max(box?.headY ?? 0, 144 + (box?.h ?? 0)));
  expect(tagged?.lines[0]?.[0]).toBe('IN Pax');
  expect(tagged?.lines[0]?.[1]).toMatch(/^BENCH Sindarosa [▲≈■●◆] 4\d% \+\d+% red$/);
  expect(tagged?.lines[0]?.[2]).toMatch(/^TAG \d\.\ds$/);
  await expect.poll(() => live(page), { timeout: 5000 }).toContain('Tag! Pax is in, Sindarosa rests.');
  // Past the short banner wait the call is still up (its 60 ticks start when it is released).
  await step(page, 20);
  expect(await tag(page)).toMatchObject({ call: 'TAG!' });
  // The flash and call go; the cooldown (150 game ticks) runs out; the bench heals toward its red life.
  await step(page, 160);
  const later = await tag(page);
  expect(later).toMatchObject({ call: '', flashes: 0 });
  expect(later?.lines[0]?.[2]).toBe('TAG READY');
  // The touch Tag button tags back.
  await page.locator('#arcadeTag').hover();
  await page.mouse.down();
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.mouse.up();
  expect((await tag(page))?.lines[0]?.[0]).toBe('IN Sindarosa');
  // KO entrance: the active hero is KO'd, the partner comes in at once (gold flash, "PAX IN!").
  const [active] = await characters(page, 0);
  await page.evaluate(`window.__TTE__.arena.setHp(${String(active?.id)}, 0)`);
  await step(page, 1);
  const ko = await tag(page);
  expect(ko).toMatchObject({ call: 'PAX IN!', ko: true });
  expect(ko?.callSpan[0]).toBeGreaterThanOrEqual(0);
  expect(ko?.callSpan[1]).toBeLessThanOrEqual(1280);
  expect(ko?.lines[0]).toEqual(['IN Pax', expect.stringMatching(/^BENCH Sindarosa [▲≈■●◆] K\.O\.$/), 'NO TAG']);
  await expect.poll(() => live(page), { timeout: 5000 }).toContain('Sindarosa is down. Pax steps in.');
  // Both AI heroes down twice: 2-0 and the results name every hero.
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < 2; k++) {
      const [foe] = await characters(page, 1);
      await page.evaluate(`window.__TTE__.arena.setHp(${String(foe?.id)}, 0)`);
      await step(page, 1);
    }
    await step(page, KO_TO_ROUND_END + (round === 0 ? INTRO : 0));
  }
  await expect(page.locator('#arcadeResults')).toBeVisible({ timeout: 10_000 });
  const summary = await page.locator('#arcadeResults p').innerText();
  expect(summary).toMatch(/^Your team: Sindarosa \(fire\) \d+% left, Pax \(earth\) \d+% left\. The AI's team \(Normal\): Fiara \(fire\) knocked out, .+ knocked out\. Rounds 2-0\./);
  await page.getByRole('link', { name: 'Main Menu' }).click();
  await page.waitForFunction(`window.location.hash === '#main'`);
  await page.evaluate(`window.__TTE__.settled()`);
  await expect(page.locator('#game canvas')).toHaveCount(0);
  await expect(page.locator('#arcadeTag')).toHaveCount(0);
  expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
  // Arcade is on by default: the menu leads with it.
  await page.goto(START);
  await expect(page.locator('#menu .mainMenuList li button')).toHaveText(MENU);
  expect(errors).toEqual([]);
});

test('3v3: the third hero only in 3v3, a BENCH line each, Tag 2 on the 4 key, three KOs a round; results with all six', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${START}&ff=arcade#arcade`);
  const third = page.getByLabel('Your third hero (3v3)');
  await expect(third).toBeDisabled();
  await page.getByLabel('Team').selectOption('2');
  await expect(third).toBeDisabled();
  await page.getByLabel('Team').selectOption('3');
  await expect(third).toBeEnabled();
  await page.getByLabel('Your race').selectOption('sindarosa');
  await page.getByLabel('Your partner (2v2)').selectOption('pax');
  await third.selectOption('curomo');
  await page.getByLabel('AI race').selectOption('fiara');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await step(page, INTRO);
  await expect(page.locator('#arcadeTag')).toBeVisible();
  await expect(page.locator('#arcadeTag2')).toBeVisible();
  const start = await tag(page);
  expect(start?.lines[0]).toEqual(['IN Sindarosa', expect.stringMatching(/^BENCH Pax [▲≈■●◆] 100%$/), expect.stringMatching(/^BENCH Curomo [▲≈■●◆] 100%$/), 'TAG READY']);
  expect(start?.lines[1]).toHaveLength(4);
  expect(start?.lines[1]?.[0]).toBe('IN Fiara');
  // Tag 2 (the 4 key) brings the third hero in; the bench reads in roster order.
  await page.keyboard.down('Digit4');
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.keyboard.up('Digit4');
  const tagged = await tag(page);
  expect(tagged).toMatchObject({ call: 'TAG!', flashes: 1 });
  expect(tagged?.lines[0]?.slice(0, 3)).toEqual(['IN Curomo', expect.stringMatching(/^BENCH Sindarosa [▲≈■●◆] 100%$/), expect.stringMatching(/^BENCH Pax [▲≈■●◆] 100%$/)]);
  // All three AI heroes down twice (two KO entrances, then the KO): 2-0, and the results name all six heroes.
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < 3; k++) {
      const [foe] = await characters(page, 1);
      await page.evaluate(`window.__TTE__.arena.setHp(${String(foe?.id)}, 0)`);
      await step(page, 1);
    }
    await step(page, KO_TO_ROUND_END + (round === 0 ? INTRO : 0));
  }
  await expect(page.locator('#arcadeResults')).toBeVisible({ timeout: 10_000 });
  const summary = await page.locator('#arcadeResults p').innerText();
  expect(summary).toMatch(/^Your team: Sindarosa \(fire\) \d+% left, Pax \(earth\) \d+% left, Curomo \(\w+\) \d+% left\. The AI's team \(Normal\): Fiara \(fire\) knocked out, .+ knocked out, .+ knocked out\. Rounds 2-0\./);
  expect(errors).toEqual([]);
});

test('reduced motion keeps the call at full size; 1v1 builds no tag view and no Tag button', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fight2v2(page);
  await page.keyboard.down('Digit3');
  await frames(page);
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.keyboard.up('Digit3');
  expect(await tag(page)).toMatchObject({ call: 'TAG!', callScale: 1, flashes: 1 });

  await page.goto('about:blank');
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Team').selectOption('1');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await step(page, INTRO);
  await expect(page.locator('#arcadeWeather')).toBeVisible();
  await expect(page.locator('#arcadeTag')).toHaveCount(0);
  expect(await tag(page)).toBeUndefined();
});

test('swap press: one tag per press (a held key does not chain), and a press in the cooldown says when it is ready', async ({ page }) => {
  const errors = collectErrors(page);
  await fight2v2(page);
  const notice = (): Promise<string> => page.evaluate<string>(`window.__TTE__.arena.swapNotice()`);
  const press = async (): Promise<void> => {
    await page.keyboard.down('Digit3');
    await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
    await page.keyboard.up('Digit3');
  };
  expect(await notice()).toBe('');
  await page.keyboard.down('Digit3');
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  expect((await tag(page))?.lines[0]?.[0]).toBe('IN Pax');
  expect(await notice()).toBe(''); // the tag went through: no refusal
  // Still held through the cooldown and past it: no second tag.
  await page.evaluate(`window.__TTE__.arena.stepLive(200)`);
  expect((await tag(page))?.lines[0]?.[0]).toBe('IN Pax');
  await page.keyboard.up('Digit3');
  // A fresh press once ready tags back; the next one, inside the cooldown, is refused with a visible line.
  // The Arcade AI may stun the hero meanwhile (a swap is refused while stunned), so a press retries until it is not stunned.
  const pressUntil = async (done: () => Promise<boolean>): Promise<void> => {
    for (let i = 0; i < 60; i++) {
      await press();
      if (await done()) return;
      await page.evaluate(`window.__TTE__.arena.stepLive(5)`);
    }
  };
  await pressUntil(async () => (await tag(page))?.lines[0]?.[0] === 'IN Sindarosa');
  expect((await tag(page))?.lines[0]?.[0]).toBe('IN Sindarosa');
  await pressUntil(async () => /^Swap ready/.test(await notice()));
  expect(await notice()).toMatch(/^Swap ready in \d\.\ds$/);
  // QA r37: the refused-swap line must read as bone on the floor (not dim grey); $SHOT_DIR keeps a real screenshot of it.
  if (process.env['SHOT_DIR']) await page.screenshot({ path: `${process.env['SHOT_DIR']}/swap-notice.png` });
  expect((await tag(page))?.lines[0]?.[0]).toBe('IN Sindarosa');
  expect(errors).toEqual([]);
});

// QA r36: a long hero name ("SINDAROSA IN!") entering near the left edge stays whole inside the screen at 1280x720 and on phones.
for (const [w, h] of [[1280, 720], [844, 390], [667, 375]] as const) {
  test(`KO entrance call is not clipped at the edges at ${String(w)}x${String(h)}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Team').selectOption('2');
    await page.getByLabel('Your race').selectOption('pax');
    await page.getByLabel('Your partner (2v2)').selectOption('sindarosa');
    await page.getByLabel('AI race').selectOption('fiara');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    await step(page, INTRO);
    const [active] = await characters(page, 0);
    await page.evaluate(`window.__TTE__.arena.setHp(${String(active?.id)}, 0)`);
    await step(page, 1);
    for (let i = 0; i < 5; i++) {
      const t = await tag(page);
      expect(t?.call).toBe('SINDAROSA IN!');
      expect(t?.callSpan[0]).toBeGreaterThanOrEqual(0);
      expect(t?.callSpan[1]).toBeLessThanOrEqual(1280);
      if (process.env['SHOT_DIR']) await page.screenshot({ path: `${process.env['SHOT_DIR']}/tag-call-${String(w)}-${String(i)}.png` });
      await step(page, 10);
    }
    expect(errors).toEqual([]);
  });
}

// WP-HF2 (HF2-2): the swap flash on the incoming hero's life bar is a rim and a sweeping glint, never a wash: the bar outside the
// stripe is as bright as at idle (a wash made a light bar look dimmed, QA r69), and the stripe is clearly brighter than idle.
test('swap flash: a glint stripe on the bar, the rest of the bar not dimmed', async ({ page }, info) => {
  const errors = collectErrors(page);
  await fight2v2(page);
  await step(page, 1);
  const canvas = page.locator('#game canvas');
  await page.keyboard.down('Digit3');
  await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
  await page.keyboard.up('Digit3');
  await frames(page);
  await step(page, 1);
  await frames(page);
  const early = await canvas.screenshot({ path: info.outputPath('swap-flash-t2.png') });
  await info.attach('swap-flash-t2', { path: info.outputPath('swap-flash-t2.png'), contentType: 'image/png' });
  await step(page, 4);
  await frames(page);
  await canvas.screenshot({ path: info.outputPath('swap-flash-t6.png') });
  await step(page, 30);
  await frames(page);
  const idle = await canvas.screenshot({ path: info.outputPath('swap-flash-t36.png') });
  // Column luminance (rows over the bar's fill, x 126..574 in Hud px) of the early and idle shots.
  const cols = await page.evaluate<{ early: number[]; idle: number[] }>(
    `(async () => {
      const load = (b64) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + b64; });
      const profile = async (b64) => {
        const i = await load(b64); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
        const x = c.getContext('2d'); x.drawImage(i, 0, 0);
        const s = i.width / 1280; const out = [];
        for (let hx = 126; hx < 574; hx++) {
          let sum = 0, n = 0;
          for (let hy = 16; hy <= 24; hy++) { const d = x.getImageData(Math.round(hx * s), Math.round(hy * s), 1, 1).data; sum += 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]; n++; }
          out.push(sum / n);
        }
        return out;
      };
      return { early: await profile(${JSON.stringify(early.toString('base64'))}), idle: await profile(${JSON.stringify(idle.toString('base64'))}) };
    })()`,
  );
  const diff = cols.early.map((v, i) => v - (cols.idle[i] ?? 0));
  let peak = 0;
  for (let i = 0; i < diff.length; i++) if ((diff[i] ?? 0) > (diff[peak] ?? 0)) peak = i;
  expect(diff[peak], 'the glint is clearly brighter than the idle bar').toBeGreaterThan(40);
  const rest = diff.filter((_, i) => Math.abs(i - peak) > 40);
  const mean = rest.reduce((a, b) => a + b, 0) / rest.length;
  expect(Math.abs(mean), 'the rest of the bar is not dimmed or washed').toBeLessThan(8);
  expect(errors).toEqual([]);
});
