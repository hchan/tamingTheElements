import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// Distinct per-kind trap art (view only): each of the four trap kinds is laid by a hero of its element, drawn arming and armed,
// and screenshotted headless to the test output dir for a visual check. No page errors, kind and label as expected.

const INTRO = 91;
const HEROES: readonly [race: string, kind: number][] = [['sindarosa', 1], ['curomo', 2], ['pax', 3], ['cyclonius', 4]];

const frames = (page: Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

for (const [race, kind] of HEROES) {
  test(`trap art: ${race} lays kind ${String(kind)}, arming then armed`, async ({ page }, info) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Your race').selectOption(race);
    await page.getByLabel('AI race').selectOption(race === 'pax' ? 'sindarosa' : 'pax');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await page.waitForFunction(ARENA_READY);
    await page.evaluate(`window.__TTE__.arena.step(${String(INTRO)})`);
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me, foe] = a.characters(); a.place(me.id, 700, 360, 0); a.place(foe.id, 1700, 360, 4); })()`);
    await page.getByRole('button', { name: 'Got it' }).click({ timeout: 1000 }).catch(() => undefined);
    await page.keyboard.down('KeyZ');
    await page.evaluate(`window.__TTE__.arena.stepLive(1)`);
    await page.keyboard.up('KeyZ');
    await page.evaluate(`(() => { const a = window.__TTE__.arena; const [me] = a.characters(); a.place(me.id, 520, 560, 0); })()`);
    await page.evaluate(`window.__TTE__.arena.stepLive(14)`);
    await frames(page);
    const arming = await page.evaluate<readonly { kind: number; label: string }[] | undefined>(`window.__TTE__.arena.traps()`);
    expect(arming?.[0]?.kind).toBe(kind);
    expect(arming?.[0]?.label).toContain('arming');
    await page.locator('#game canvas').screenshot({ path: info.outputPath(`${race}-arming.png`) });
    await page.evaluate(`window.__TTE__.arena.stepLive(30)`);
    await frames(page);
    const armed = await page.evaluate<readonly { kind: number; label: string }[] | undefined>(`window.__TTE__.arena.traps()`);
    expect(armed?.[0]?.label).not.toContain('arming');
    await page.locator('#game canvas').screenshot({ path: info.outputPath(`${race}-armed.png`) });
    expect(errors).toEqual([]);
  });
}
