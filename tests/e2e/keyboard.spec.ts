import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, collectErrors, fixture, seedViaGameMaster, waitForRoute } from './parity/helpers';

// Page-side code is passed as strings because tsconfig.node has no DOM lib.
const ACTIVE_TEXT = `(() => {
  const e = document.activeElement;
  if (!e) return '';
  const label = e.labels && e.labels[0] ? e.labels[0].textContent : '';
  return (e.getAttribute('aria-label') || label || e.textContent || '').trim();
})()`;
const ACTIVE_OUTLINE = `(() => { const s = getComputedStyle(document.activeElement); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; })()`;

async function activeText(page: Page): Promise<string> {
  return page.evaluate<string>(ACTIVE_TEXT);
}

/** Tabs until the focused control's text starts with `text`; fails rather than looping forever. */
async function tabTo(page: Page, text: string, max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if ((await activeText(page)).startsWith(text)) return;
  }
  throw new Error(`Tab never reached "${text}" in ${String(max)} presses (last: "${await activeText(page)}")`);
}

async function seededMenu(page: Page): Promise<void> {
  await seedViaGameMaster(page, fixture('v0-ch3'));
  await page.goto('/?seed=7');
  await page.getByRole('heading', { level: 1, name: 'Taming the Elements' }).waitFor();
}

test.describe('keyboard-only menu navigation', () => {
  test('tab order follows the visual order and focus is clearly visible', async ({ page }) => {
    await seededMenu(page);
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Tab');
      seen.push(await activeText(page));
    }
    expect(seen).toEqual([
      'New Game',
      'Continue',
      'Garrison',
      'Settings',
      'Current Objectives',
      'Story Mode',
      'Wiki',
      'Key Bindings',
      'About',
    ]);
    const outline = await page.evaluate<{ style: string; width: number }>(ACTIVE_OUTLINE);
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test('disabled entries are skipped without a save', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.keyboard.press('Tab');
    expect(await activeText(page)).toBe('New Game');
    await page.keyboard.press('Tab');
    expect(await activeText(page)).toBe('Settings');
  });

  test('Enter opens a screen, Escape goes back, Space activates a Back link', async ({ page }) => {
    await seededMenu(page);
    await tabTo(page, 'Wiki');
    await page.keyboard.press('Enter');
    await waitForRoute(page, '#wiki');
    // The new screen's heading takes focus and the document is named after it.
    await expect(page).toHaveTitle('Wiki - Taming the Elements');
    expect(await page.evaluate<string>(`document.activeElement.tagName`)).toBe('H1');
    await page.keyboard.press('Escape');
    await waitForRoute(page, '#main');

    await tabTo(page, 'About');
    await page.keyboard.press('Space');
    await waitForRoute(page, '#about');
    await tabTo(page, 'Back');
    await page.keyboard.press('Space');
    await waitForRoute(page, '#main');
  });

  for (const route of ['settings', 'keyBindings', 'about', 'wiki', 'garrison', 'race_fiara', 'currentObjectives']) {
    test(`no keyboard trap on #${route}: Tab reaches Back and Enter leaves`, async ({ page }) => {
      await seededMenu(page);
      await page.evaluate(`window.location.hash = '#${route}'`);
      await waitForRoute(page, `#${route}`);
      await page.locator('#menu h1').waitFor();
      await tabTo(page, 'Back', 60);
      await page.keyboard.press('Enter');
      await waitForRoute(page, '#main');
    });
  }

  test('settings: checkboxes toggle with Space, Enter on Save persists and returns', async ({ page }) => {
    await seededMenu(page);
    await tabTo(page, 'Settings');
    await page.keyboard.press('Enter');
    await waitForRoute(page, '#settings');
    await tabTo(page, 'Reduce motion');
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Reduce motion')).toBeChecked();
    await tabTo(page, 'Save');
    await page.keyboard.press('Enter');
    await waitForRoute(page, '#main');
    expect(await page.evaluate<string>(`document.documentElement.dataset.reduceMotion`)).toBe('true');
  });

  test('menu to battle to pause dialog and back using only the keyboard', async ({ page }) => {
    const errors = collectErrors(page);
    await seededMenu(page);
    await tabTo(page, 'Garrison');
    await page.keyboard.press('Enter');
    await waitForRoute(page, '#garrison');

    await tabTo(page, 'Fiara');
    await page.keyboard.press('Space');
    // Selecting re-renders the list; focus stays on the same row, now pressed.
    expect(await page.evaluate<string>(`document.activeElement.getAttribute('aria-pressed')`)).toBe('true');
    await page.keyboard.press('Enter');
    expect(await page.evaluate<string>(`document.activeElement.getAttribute('aria-pressed')`)).toBe('false');
    await page.keyboard.press('Space');

    await tabTo(page, 'Practice');
    await page.keyboard.press('Enter');
    await page.waitForFunction(ARENA_READY);
    await page.waitForFunction(`window.__TTE__.state().tick > 0`);

    // Match start is announced in the (assertive) live region.
    await expect(page.locator('#liveRegionAssertive')).toContainText('Match started');

    // Pause: a modal dialog takes focus and traps Tab.
    await page.keyboard.press('Shift+P');
    const dialog = page.getByRole('dialog', { name: 'Paused' });
    await expect(dialog).toBeVisible();
    expect(await activeText(page)).toBe('Resume');
    await page.keyboard.press('Tab');
    expect(await activeText(page)).toBe('Exit to menu');
    await page.keyboard.press('Tab');
    expect(await activeText(page)).toBe('Resume');
    await page.keyboard.press('Shift+Tab');
    expect(await activeText(page)).toBe('Exit to menu');

    // Escape resumes and the sim runs again.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.waitForFunction(`window.__TTE__.state().paused === false`);

    // Pause again and leave through the dialog's link.
    await page.keyboard.press('Shift+P');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await waitForRoute(page, '#main');
    await page.evaluate(`window.__TTE__.settled()`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate<number>(`window.__TTE__.listeners()`)).toBe(0);
    expect(errors).toEqual([]);
  });
});
