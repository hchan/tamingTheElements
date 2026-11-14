import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { ARENA_READY, START, collectErrors } from './parity/helpers';

// The fighting-game layout preset reaches the match HUD: the Charge box reads H and Cleanse reads ';' (QA r14).
// Screenshot goes to ~/claudetmp/hud-labels for a human look.
const SHOTS = join(homedir(), 'claudetmp', 'hud-labels');

test('SF preset: match HUD follows the layout', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${START}#keyBindings`);
  await page.evaluate(`document.getElementById('presetFighting').click()`);
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByLabel('Your race').selectOption('fiara');
  await page.getByLabel('AI race').selectOption('sindarosa');
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await page.evaluate(`window.__TTE__.arena.step(100)`);
  await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  await page.screenshot({ path: join(SHOTS, 'sf-preset-hud.png') });
  expect(errors).toEqual([]);
});
