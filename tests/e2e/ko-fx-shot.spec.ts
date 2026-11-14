import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters, collectErrors } from './parity/helpers';

// The KO punch frame: the final blow desaturates the picture; reduced motion shows no wash. The sim stays paused (manual
// stepping), so the wash is jumped to its peak with the shockSeek probe and screenshotted there.
// Page-side code is passed as strings because tsconfig.node has no DOM lib.
const INTRO = 91;

interface Shock {
  washAge: number;
  wash: number;
  rings: number;
}
const shock = (page: Page): Promise<Shock | undefined> => page.evaluate<Shock | undefined>(`window.__TTE__.arena.shockFx()`);

async function ko(page: Page): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(${String(INTRO + 20)})`);
  const [foe] = await characters(page, 1);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setHp(${String(foe?.id)}, 0); a.step(1); })()`);
}

test('Arcade: the KO drains the colour; the peak frame is captured', async ({ page }, info) => {
  const errors = collectErrors(page);
  await ko(page);
  await expect.poll(async () => (await shock(page))?.washAge).toBe(0);
  await page.evaluate(`window.__TTE__.arena.shockSeek(200)`);
  expect((await shock(page))?.wash).toBeGreaterThan(0.3);
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const shot = await page.locator('#game canvas').screenshot({ path: info.outputPath('ko-peak.png') });
  expect(shot.length).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});

test('reduced motion: no KO wash and no ring', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = collectErrors(page);
  await ko(page);
  const s = await shock(page);
  expect(s?.washAge ?? -1).toBe(-1);
  expect(s?.rings ?? 0).toBe(0);
  expect(errors).toEqual([]);
});

// A super's hit (strength 3) rings the victim. Reduced motion draws none.
const SUPER = 1 << 13;
async function heavyHit(page: Page): Promise<void> {
  await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`(() => {
    const a = window.__TTE__.arena;
    a.step(${String(INTRO)});
    const [me, foe] = a.characters();
    a.place(me.id, 300, 360, 0);
    a.place(foe.id, 450, 360, 4);
    a.setMeter(0, 1000);
    a.step(1, [${String(SUPER)}, 0]);
    a.step(60);
  })()`);
}

test('Arcade: a heavy hit throws a shockwave ring (peak frame captured); none under reduced motion', async ({ page }, info) => {
  const errors = collectErrors(page);
  await heavyHit(page);
  expect((await shock(page))?.rings).toBeGreaterThan(0);
  await page.evaluate(`window.__TTE__.arena.shockSeek(110)`);
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const shot = await page.locator('#game canvas').screenshot({ path: info.outputPath('ring-peak.png') });
  expect(shot.length).toBeGreaterThan(2000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await heavyHit(page);
  expect((await shock(page))?.rings).toBe(0);
  expect(errors).toEqual([]);
});

// r17: on a phone landscape the super cut-in band covers the top third; the first gold number and ring wait until it clears.
test('Arcade 844x390: no super number or ring is live while the cut-in band is up', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?ff=arenaDemo,arcade&manual=1&seed=7');
  await page.locator('#game canvas').waitFor();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`(() => {
    const a = window.__TTE__.arena;
    a.step(${String(INTRO)});
    const [me, foe] = a.characters();
    a.place(me.id, 300, 360, 0);
    a.place(foe.id, 400, 360, 4);
    a.setMeter(0, 1000);
    a.step(1, [${String(SUPER)}, 0]);
  })()`);
  let sawBand = false;
  let landed = false;
  for (let i = 0; i < 90 && !landed; i++) {
    await page.evaluate('window.__TTE__.arena.step(1)');
    await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const band = (await page.evaluate<{ bandAlpha: number } | undefined>('window.__TTE__.arena.superFx()'))?.bandAlpha ?? 0;
    const s = await page.evaluate<{ rings: number; superNumbers: number; held: number } | undefined>('window.__TTE__.arena.shockFx()');
    if (band > 0) {
      sawBand = true;
      expect(s?.rings ?? 0).toBe(0);
      expect(s?.superNumbers ?? 0).toBe(0);
    }
    landed = (s?.superNumbers ?? 0) > 0;
  }
  expect(sawBand).toBe(true);
  expect(landed).toBe(true);
  await page.locator('#game canvas').screenshot({ path: info.outputPath('super-number-after-band.png') });
  expect(errors).toEqual([]);
});
