import { expect, test, type Page } from '@playwright/test';
import { START, collectErrors } from './parity/helpers';

// PB1: the Fight / Start bar takes its own space under one scroll region (.pickScroll), so at scroll 0 it never covers the
// partner slot, a hero tile or a focused control. Page-side code is passed as strings (no DOM lib in tsconfig.node).

interface Rect {
  top: number;
  bottom: number;
}
const rectOf = (page: Page, sel: string): Promise<Rect | null> =>
  page.evaluate<Rect | null>(
    `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; })()`,
  );

function need<T>(v: T | null | undefined): T {
  expect(v).toBeTruthy();
  return v as T;
}

const BAR = '#arcadePick .vsActions, #tourPick .heroActions';

const VIEWPORTS: ReadonlyArray<readonly [string, number, number, boolean]> = [
  ['1280x720', 1280, 720, false],
  ['1920x1080', 1920, 1080, false],
  ['1024x768', 1024, 768, false],
  ['800x600', 800, 600, false],
  ['phone-landscape-667', 667, 375, true],
  ['phone-landscape-844', 844, 390, true],
  ['phone-portrait', 390, 844, true],
];

for (const [name, width, height, touch] of VIEWPORTS) {
  test.describe(`picker bar ${name}`, () => {
    test.use({
      viewport: { width, height },
      deviceScaleFactor: touch ? 2 : 1,
      isMobile: touch,
      hasTouch: touch,
    });

    test('Versus: the bar is below the scroll region, the page does not scroll sideways', async ({
      page,
    }) => {
      const errors = collectErrors(page);
      await page.goto(`${START}&ff=arcade#arcade`);
      await expect(page.getByRole('button', { name: 'Fight!' })).toBeVisible();
      const region = await rectOf(page, '.pickScroll');
      const bar = await rectOf(page, BAR);
      expect(region).not.toBeNull();
      expect(bar).not.toBeNull();
      expect(need(region).bottom).toBeLessThanOrEqual(need(bar).top + 1);
      expect(need(bar).bottom).toBeLessThanOrEqual(height + 1);
      const wide = await page.evaluate('document.documentElement.scrollWidth > innerWidth + 1');
      expect(wide).toBe(false);
      expect(errors).toEqual([]);
    });

    test('Play: the three slots and the first tile row are above the bar at scroll 0', async ({
      page,
    }) => {
      await page.goto(`${START}&ff=arcade#tour`);
      await expect(page.locator('#tourPick')).toBeVisible();
      const bar = await rectOf(page, BAR);
      const slot = await rectOf(page, '#tourSlot3');
      const tile = await rectOf(page, '#tourPick .heroTile');
      expect(bar).not.toBeNull();
      // Hard targets from 1024x768 up; phones may scroll to the tiles inside the region.
      if (width >= 800 && height >= 600) {
        expect(need(slot).bottom).toBeLessThanOrEqual(need(bar).top + 1);
        expect(need(tile).bottom).toBeLessThanOrEqual(need(bar).top + 1);
      } else {
        expect(need(slot).top).toBeLessThan(need(bar).top);
      }
    });
  });
}

test.describe('Versus 2v2 at 1280x720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the partner slot is visible above the bar at scroll 0', async ({ page }) => {
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByRole('radio', { name: /^✓?2v2 tag team$/ }).click();
    const partner = await rectOf(page, '#arcadePick .vsSide1 .vsSlotItem:nth-child(2)');
    const bar = await rectOf(page, BAR);
    expect(partner).not.toBeNull();
    expect(need(partner).bottom).toBeLessThanOrEqual(need(bar).top + 1);
  });

  test('a focused hero tile scrolls into the region, clear of the bar', async ({ page }) => {
    await page.goto(`${START}&ff=arcade#arcade`);
    const last = page.locator('#arcadePick .heroTile').last();
    await last.focus();
    const t = await last.boundingBox();
    const bar = await rectOf(page, BAR);
    expect(t).not.toBeNull();
    expect(need(t).y + need(t).height).toBeLessThanOrEqual(need(bar).top + 1);
  });

  test('the More below strip shows while the region continues and goes at its end', async ({
    page,
  }) => {
    await page.goto(`${START}&ff=arcade#arcade`);
    const box = page.locator('.pickScroll');
    await expect(box).toHaveAttribute('data-more', '');
    await page.evaluate(
      `(() => { const e = document.querySelector('.pickScroll'); e.scrollTop = e.scrollHeight; })()`,
    );
    await expect(box).not.toHaveAttribute('data-more', '');
  });

  test('the More below tab sits above the bar at the right, small, and covers no card (WP-HF1)', async ({ page }) => {
    await page.goto(`${START}&ff=arcade#arcade`);
    await expect(page.locator('.pickScroll')).toHaveAttribute('data-more', '');
    const tab = await page.evaluate<{ top: number; bottom: number; right: number; width: number; barRight: number; content: string; hits: boolean[]; clash: boolean }>(`(() => {
      const bar = document.querySelector(${JSON.stringify(BAR)});
      const bb = bar.getBoundingClientRect();
      const cs = getComputedStyle(bar, '::before');
      const width = parseFloat(cs.width);
      const height = parseFloat(cs.height);
      const right = bb.right - parseFloat(cs.right);
      const buttons = [...bar.querySelectorAll('button, a')].map((b) => b.getBoundingClientRect());
      const clash = buttons.some((r) => r.left < right && r.right > right - width && r.top < bb.top && r.bottom > bb.top - height);
      const styleEl = document.createElement('style');
      styleEl.textContent = '.pickScroll[data-more] + .vsActions::before, .pickScroll[data-more] + .heroActions::before { pointer-events: auto !important; }';
      document.head.append(styleEl);
      const region = document.querySelector('.pickScroll').getBoundingClientRect();
      const hits = [...document.querySelectorAll('.pickScroll .heroTile')].map((t) => t.getBoundingClientRect())
        .filter((r) => r.top >= region.top && r.bottom <= region.bottom && r.height > 0)
        .map((r) => { const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && !!e.closest('.heroTile'); });
      styleEl.remove();
      return { top: bb.top - 2 - height, bottom: bb.top, right, width, barRight: bb.right, content: cs.content, hits, clash };
    })()`);
    expect(tab.content).toContain('More below');
    expect(tab.width).toBeLessThanOrEqual(160);
    expect(tab.barRight - tab.right).toBeGreaterThanOrEqual(11);
    expect(tab.clash).toBe(false);
    expect(tab.hits.length).toBeGreaterThan(0);
    expect(tab.hits.every(Boolean)).toBe(true);
    await page.evaluate(`(() => { const e = document.querySelector('.pickScroll'); e.scrollTop = e.scrollHeight; })()`);
    await expect(page.locator('.pickScroll')).not.toHaveAttribute('data-more', '');
    expect(await page.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(BAR)}), '::before').content`)).toBe('none');
  });

  test('picking from the select moves the detail pane (A8)', async ({ page }) => {
    await page.goto(`${START}&ff=arcade#arcade`);
    await page.getByLabel('Your race').selectOption('lavax');
    await expect(page.locator('.heroPanel .heroName')).toHaveText('Lavax');
  });
});

test.describe('touch targets', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: false });

  test('the Fight and Back buttons keep at least 44 px on a coarse pointer', async ({ page }) => {
    await page.goto(`${START}&ff=arcade#arcade`);
    for (const label of ['Fight!', 'Back']) {
      const b = await page
        .locator('#arcadePick .vsActions .menuButton', { hasText: label })
        .boundingBox();
      expect(b).not.toBeNull();
      expect(need(b).height).toBeGreaterThanOrEqual(44);
    }
  });
});

// Short landscape phones: the option rows used to fill the screen, so no hero tile showed until you scrolled (QA r60/r61).
const SHORT_PHONES: ReadonlyArray<readonly [number, number]> = [[667, 375], [812, 375]];
for (const [w, h] of SHORT_PHONES) {
  test.describe(`Versus heroes visible at ${String(w)}x${String(h)}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    test('at least three hero tiles sit fully above the bar at scroll 0, targets stay 44 px', async ({ page }) => {
      await page.goto(`${START}&ff=arcade#arcade`);
      await expect(page.locator('#arcadePick .heroTile').first()).toBeAttached();
      const bar = need(await rectOf(page, BAR));
      const shown = await page.evaluate<number>(
        `(() => { const bar = document.querySelector(${JSON.stringify(BAR)}).getBoundingClientRect(); const region = document.querySelector('.pickScroll').getBoundingClientRect(); return [...document.querySelectorAll('#arcadePick .heroTile')].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top >= region.top && r.bottom <= bar.top + 1; }).length; })()`,
      );
      expect(shown).toBeGreaterThanOrEqual(3);
      for (const sel of ['#arcadePick .vsSegment', '#arcadePick .vsActions .menuButton']) {
        const h44 = await page.evaluate<number>(
          `Math.min(...[...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => e.getBoundingClientRect().height))`,
        );
        expect(h44).toBeGreaterThanOrEqual(44);
      }
      expect(bar.bottom).toBeLessThanOrEqual(h + 1);
    });
  });
}
