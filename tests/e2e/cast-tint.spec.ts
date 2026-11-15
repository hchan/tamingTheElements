import { expect, test } from '@playwright/test';
import { ARENA_READY, START } from './parity/helpers';

// CA1: a melee caster must not flash the ice-blue freeze tint during its cast recovery (the sim sets the frozen flag there; legacy
// freeze(true) skipped the colour change). Shots go to $SHOT_DIR when set.
const shotDir = process.env['SHOT_DIR'];
const FROZEN_TINT = 0x88ccff;

test('Curomo Ice Shock: the caster never turns ice-blue while it casts and recovers', async ({ page }) => {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('curomo');
  await page.getByLabel('AI race').selectOption('rokcore');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(100)`);
  await page.evaluate(`document.querySelector('.firstRunDone')?.click()`);
  const chars = await page.evaluate<{ id: number; team: number }[]>(`window.__TTE__.arena.characters()`);
  const me = chars.find((c) => c.team === 0);
  const foe = chars.find((c) => c.team === 1);
  expect(me && foe).toBeTruthy();
  await page.evaluate(`window.__TTE__.arena.place(${String(me?.id)}, 560, 300, 0); window.__TTE__.arena.place(${String(foe?.id)}, 660, 300, 0); window.__TTE__.arena.step(1)`);
  await page.keyboard.down('Digit1');
  const seen = await page.evaluate<number[]>(`(async () => {
    const out = [];
    for (let i = 0; i < 30; i++) {
      window.__TTE__.arena.stepLive(1);
      await new Promise((r) => requestAnimationFrame(r));
      const t = window.__TTE__.arena.fx().tints.find((x) => x.id === ${String(me?.id)});
      out.push(t ? t.tint : -1);
    }
    return out;
  })()`);
  if (shotDir) await page.screenshot({ path: `${shotDir}/cast-tint.png` });
  await page.keyboard.up('Digit1');
  expect(seen.length).toBe(30);
  expect(seen).not.toContain(FROZEN_TINT);
});
