import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  fixture,
  goToHash,
  killEnemy,
  seedViaGameMaster,
  skipCinematic,
  START,
  startBattle,
  waitForRoute,
} from './parity/helpers';

/** Runs axe over the current page and asserts zero serious or critical violations. */
async function audit(page: Page, name: string): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze();
  const bad = result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${String(v.impact)}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  expect(bad, `${name}: ${bad.join('\n')}`).toEqual([]);
}

async function show(page: Page, hash: string): Promise<void> {
  await goToHash(page, hash);
  await page.locator('#menu .menuPage').waitFor();
}

test.describe('axe-core audit of every DOM screen', () => {
  test('document has a language and a title', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate<string>(`document.documentElement.lang`)).toBe('en');
    expect(await page.title()).not.toBe('');
  });

  test('menus with a chapter-3 save', async ({ page }) => {
    const save = fixture('v0-ch3');
    await seedViaGameMaster(page, save);
    await goToHash(page, '#main');
    await page.locator('#menu .mainMenuList').waitFor();
    await audit(page, 'main menu');
    for (const [hash, name] of [
      ['#garrison', 'garrison'],
      ['#settings', 'settings'],
      ['#currentObjectives', 'objectives'],
      ['#wiki', 'wiki'],
      ['#keyBindings', 'key bindings'],
      ['#about', 'about'],
      ['#race_fiara', 'race details'],
      ['#defeat', 'defeat'],
      ['#gameMaster', 'game master'],
    ] as const) {
      await show(page, hash);
      await audit(page, name);
    }
    await show(page, `#character_${save.garrison[0]?.id ?? ''}`);
    await audit(page, 'character details');
    await show(page, '#garrison');
    await page.locator('#garrisonTable .garrisonRow').first().click();
    await audit(page, 'garrison with a selection');
  });

  test('empty save: main menu, garrison, objectives, unknown race', async ({ page }) => {
    await page.goto(START);
    await page.locator('#menu .mainMenuList').waitFor();
    await audit(page, 'main menu (no save)');
    for (const hash of ['#garrison', '#currentObjectives', '#race_nope', '#character_nope']) {
      await show(page, hash);
      await audit(page, hash);
    }
  });

  test('results screen after a win and settings with high contrast', async ({ page }) => {
    await seedViaGameMaster(page, fixture('v0-ch3'));
    await startBattle(page, 'enterPracticeContainer');
    await killEnemy(page);
    await waitForRoute(page, '#victory');
    await page.locator('#menu .menuPage').waitFor();
    await audit(page, 'victory');
    await show(page, '#settings');
    await page.getByLabel('High contrast').check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await show(page, '#settings');
    expect(await page.evaluate<string>(`document.documentElement.dataset.highContrast`)).toBe('true');
    await audit(page, 'settings (high contrast)');
  });

  test('story mode and new game cinematics', async ({ page }) => {
    await page.goto(`${START}#storyMode`);
    await page.locator('#cinematic #game canvas').waitFor();
    await audit(page, 'story mode');
    await skipCinematic(page);
    await waitForRoute(page, '#main');
    await page.evaluate(`window.__TTE__.settled()`);
    await goToHash(page, '#newGame');
    await page.locator('#cinematic #game canvas').waitFor();
    await audit(page, 'new game');
    await skipCinematic(page);
    await waitForRoute(page, '#garrison');
  });
});
