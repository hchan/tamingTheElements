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

/**
 * Waits until the new screen has mounted and its async content has rendered. `waitForRoute` only sees `location.hash`,
 * which changes synchronously on click; the router mounts the screen on the later `hashchange` task, and until then the
 * main menu (with its own h1) is still on screen, so a Tab pressed now cycles the main menu (measured: ~3% of runs).
 * Settings and other save-backed screens then show "Loading..." until the IndexedDB load resolves.
 */
async function loaded(page: Page): Promise<void> {
  await expect(page.locator('#menu h1')).not.toHaveText('Taming the Elements');
  await expect(page.locator('#menu').getByText('Loading...', { exact: true })).toHaveCount(0);
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
    // The menu focuses its first entry on load, so Play is already active.
    seen.push(await activeText(page));
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      seen.push(await activeText(page));
    }
    expect(seen).toEqual(['World Tour', 'Versus', 'Online', 'Settings', 'Help']);
    const outline = await page.evaluate<{ style: string; width: number }>(ACTIVE_OUTLINE);
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test('the five menu entries are all enabled without a save', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { level: 1 }).waitFor();
    expect(await activeText(page)).toBe('World Tour');
    for (const next of ['Versus', 'Online', 'Settings', 'Help']) {
      await page.keyboard.press('Tab');
      expect(await activeText(page)).toBe(next);
    }
  });

  test('Enter opens a screen, Escape goes back, Space activates a Back link', async ({ page }) => {
    await seededMenu(page);
    await tabTo(page, 'Help');
    await page.keyboard.press('Enter');
    await waitForRoute(page, '#help');
    await tabTo(page, 'Wiki');
    await page.keyboard.press('Enter');
    await waitForRoute(page, '#wiki');
    // The new screen's heading takes focus and the document is named after it.
    await expect(page).toHaveTitle('Wiki - Taming the Elements');
    expect(await page.evaluate<string>(`document.activeElement.tagName`)).toBe('H1');
    await page.keyboard.press('Escape');
    await expect(page).toHaveTitle('Taming the Elements');
    await page.evaluate(`window.location.hash = '#help'`);
    await waitForRoute(page, '#help');
    await tabTo(page, 'About');
    await page.keyboard.press('Space');
    await expect(page).toHaveTitle('About - Taming the Elements');
    await tabTo(page, 'Back');
    await page.keyboard.press('Space');
    await expect(page).toHaveTitle('Taming the Elements');
  });

  for (const route of ['settings', 'help', 'keyBindings', 'about', 'wiki', 'garrison', 'race_fiara', 'currentObjectives']) {
    test(`no keyboard trap on #${route}: Tab reaches Back and Enter leaves`, async ({ page }) => {
      await seededMenu(page);
      await page.evaluate(`window.location.hash = '#${route}'`);
      await waitForRoute(page, `#${route}`);
      await loaded(page);
      if (route === 'keyBindings') await expect(page.locator('#menu .padBindings')).toBeVisible(); // lazy chunk
      const stops = await page.locator(
        '#menu :is(a[href],button:not([disabled]),input:not([disabled]),select,textarea,summary,[tabindex]:not([tabindex="-1"]))',
      ).count();
      await tabTo(page, 'Back', stops + 2); // +2: the BODY stop and one spare; a real trap never reaches Back
      await page.keyboard.press('Enter');
      await waitForRoute(page, '#main');
    });
  }

  for (const route of ['keyBindings', 'settings']) {
    test(`#${route}: Shift+Tab upward never leaves the focused control behind the sticky bar (WCAG 2.4.11)`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await seededMenu(page);
      await page.evaluate(`window.location.hash = '#${route}'`);
      await waitForRoute(page, `#${route}`);
      await loaded(page);
      if (route === 'keyBindings') await expect(page.locator('#menu .padBindings')).toBeVisible();
      const stops = await page.locator(
        '#menu :is(a[href],button:not([disabled]),input:not([disabled]),select,textarea,summary,[tabindex]:not([tabindex="-1"]))',
      ).count();
      // Walk to the last control (scrolls the page down), then Shift+Tab back up through all of them.
      await page.keyboard.press('Shift+Tab');
      for (let i = 0; i < stops; i++) await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      const probe = `(() => { const bar = document.querySelector('.settingsBar').getBoundingClientRect(); const r = document.activeElement.getBoundingClientRect(); return { bar: bar.bottom, top: r.top, inBar: !!document.activeElement.closest('.settingsBar') || document.activeElement === document.body, stuck: bar.top <= 0 }; })()`;
      let checked = 0;
      for (let i = 0; i < stops; i++) {
        const m = await page.evaluate<{ bar: number; top: number; inBar: boolean; stuck: boolean }>(probe);
        if (!m.inBar && m.stuck) { // only while the bar is pinned can it cover anything
          expect(m.top, `focused control top ${String(m.top)} vs bar bottom ${String(m.bar)} (step ${String(i)})`).toBeGreaterThanOrEqual(m.bar);
          checked++;
        }
        await page.keyboard.press('Shift+Tab');
      }
      expect(checked).toBeGreaterThan(5);
    });
  }

  test('settings: checkboxes toggle with Space, Enter on Save persists and returns', async ({ page }) => {
    await seededMenu(page);
    await tabTo(page, 'Settings');
    await page.keyboard.press('Enter');
    await waitForRoute(page, '#settings');
    await loaded(page);
    await tabTo(page, 'Reduce motion');
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Reduce motion')).toBeChecked();
    await tabTo(page, 'Save');
    await page.keyboard.press('Enter');
    await waitForRoute(page, '#main');
    expect(await page.evaluate<string>(`document.documentElement.dataset.reduceMotion`)).toBe('true');
  });

  test('settings: Escape goes back to the main menu even with a slider or checkbox focused (QA r120 N2)', async ({ page }) => {
    await seededMenu(page);
    await tabTo(page, 'Settings');
    await page.keyboard.press('Enter');
    await waitForRoute(page, '#settings');
    await loaded(page);
    await tabTo(page, 'Music');
    expect(await page.evaluate<string>(`document.activeElement.type`)).toBe('range');
    await page.keyboard.press('Escape');
    await waitForRoute(page, '#main');
    await page.evaluate(`window.location.hash = '#settings'`);
    await waitForRoute(page, '#settings');
    await loaded(page);
    await tabTo(page, 'Reduce motion');
    expect(await page.evaluate<string>(`document.activeElement.type`)).toBe('checkbox');
    await page.keyboard.press('Escape');
    await waitForRoute(page, '#main');
  });

  test('menu to battle to pause dialog and back using only the keyboard', { tag: '@smoke' }, async ({ page }) => {
    const errors = collectErrors(page);
    await seededMenu(page);
    await page.evaluate(`window.location.hash = '#garrison'`);
    await waitForRoute(page, '#garrison');
    await loaded(page);

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
    expect(await activeText(page)).toBe('Quit to menu');
    await page.keyboard.press('Tab');
    expect(await activeText(page)).toBe('Resume');
    await page.keyboard.press('Shift+Tab');
    expect(await activeText(page)).toBe('Quit to menu');

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
