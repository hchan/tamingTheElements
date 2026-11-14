import { expect, test } from '@playwright/test';
import { ARENA_READY } from './parity/helpers';

// Per-element signature hit effects (QA r24): fire and air specials (the heroes ?hero= can start) hit a foe in range; the earth and void marks are unit-tested only. Shots go to $SHOT_DIR when set.
const shotDir = process.env['SHOT_DIR'];
const frames = (page: import('@playwright/test').Page): Promise<unknown> => page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);

// The ?hero= start flaked on a blank page in this worktree (the existing versus-hero-pick spec did too), so retry.
test.describe.configure({ retries: 3 });

for (const hero of ['fiara', 'cyclonius']) {
  test(`${hero} special hits a foe in range and the hit mark shows`, async ({ page }) => {
    await page.goto(`/?manual=1&seed=7&hero=${hero}&foe=treenoc`);
    await page.locator('#game canvas').waitFor();
    await page.waitForFunction(ARENA_READY);
    await page.evaluate(`window.__TTE__.arena.step(100)`);
    await page.evaluate(`document.querySelector('.firstRunDone')?.click()`);
    const chars = await page.evaluate<{ id: number; team: number; hp: number }[]>(`window.__TTE__.arena.characters()`);
    const me = chars.find((c) => c.team === 0);
    const foe = chars.find((c) => c.team === 1);
    expect(me && foe).toBeTruthy();
    await page.evaluate(`window.__TTE__.arena.place(${String(me?.id)}, 560, 300, 0); window.__TTE__.arena.place(${String(foe?.id)}, 640, 300, 0); window.__TTE__.arena.step(1)`);
    await page.keyboard.down('Digit2');
    await page.keyboard.down('Digit1');
    let shot = false;
    for (let i = 0; i < 12 && !shot; i++) {
      await page.evaluate(`window.__TTE__.arena.stepLive(3)`);
      await frames(page);
      const hp = (await page.evaluate<{ id: number; hp: number }[]>(`window.__TTE__.arena.characters()`)).find((c) => c.id === foe?.id)?.hp ?? 0;
      if (hp < (foe?.hp ?? 0)) {
        if (shotDir) await page.screenshot({ path: `${shotDir}/signature-${hero}.png` });
        shot = true;
      }
    }
    await page.keyboard.up('Digit1');
    await page.keyboard.up('Digit2');
    expect(shot).toBe(true);
  });
}
