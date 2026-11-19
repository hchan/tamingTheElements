import { expect, test } from '@playwright/test';

// Online code step without hand copying: the host's Copy button shows Copied and puts the code on the clipboard, the Paste button fills the
// join box from it, and the buttons are big targets at 1280x720 (no horizontal overflow). Phone viewports are not supported (owner, 2026-11-19), so the old 360x640 / 390x844 touch runs are gone.

{
  const [w, h] = [1280, 720] as const;
  test(`online code step: Copy shows Copied, Paste fills the box, big targets at ${String(w)}x${String(h)}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, permissions: ['clipboard-read', 'clipboard-write'] });
    try {
      const page = await ctx.newPage();
      const sizes = (ids: string[]): Promise<{ over: number; small: string[] }> => page.evaluate<{ over: number; small: string[] }>(`((ids) => {
        const small = ids.filter((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.height < 52 || r.width < 120; }).map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return id + ' ' + r.width + 'x' + r.height; });
        return { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, small };
      })(${JSON.stringify(ids)})`);
      await page.goto('/?ff=arcade&ice=none#online');
      await page.screenshot({ path: `.scratch/online/roles-${String(w)}.png` });
      await page.locator('#onlineRoleHost').click();
      await expect(page.locator('#onlineJoinPath')).toBeHidden();
      await expect(page.locator('#onlineOffer')).not.toHaveValue('', { timeout: 15_000 });
      const code = await page.locator('#onlineOffer').inputValue();
      const hostSizes = await sizes(['onlineRoleHost', 'onlineCopyCode', 'onlineCopyLink', 'onlinePasteAnswer', 'onlineConnect']);
      // Copy link / Copy code stay on one line (QA r100 P3, lost from 65f9c2ab).
      const lineH = await page.evaluate<number[]>(`['onlineCopyLink', 'onlineCopyCode'].map((id) => { const b = document.getElementById(id); return b.scrollHeight - parseFloat(getComputedStyle(b).paddingTop) - parseFloat(getComputedStyle(b).paddingBottom) - parseFloat(getComputedStyle(b).borderTopWidth) - parseFloat(getComputedStyle(b).borderBottomWidth) <= parseFloat(getComputedStyle(b).lineHeight === 'normal' ? getComputedStyle(b).fontSize : getComputedStyle(b).lineHeight) * 1.6 ? 1 : 2; })`);
      expect(lineH).toEqual([1, 1]);
      await expect(page.locator('#onlineCopyLink')).toHaveText('Copy invite link');
      await page.locator('#onlineManual summary').click();
      await page.locator('#onlineCopyCode').click();
      await expect(page.locator('#onlineCopyCode')).toHaveText('Copied');
      expect(await page.evaluate('navigator.clipboard.readText()')).toBe(code);
      await page.locator('#onlineRoleJoin').click();
      await expect(page.locator('#onlineHostPath')).toBeHidden();
      await page.locator('#onlinePasteOffer').click();
      await expect(page.locator('#onlinePasteOffer')).toHaveText('Pasted');
      await expect(page.locator('#onlineOfferIn')).toHaveValue(code);
      await expect(page.locator('#onlineCopyAnswer')).toBeVisible({ timeout: 15_000 });
      await page.evaluate(`new Promise((r) => { document.getElementById('onlinePasteOffer').scrollIntoView({ block: 'center' }); requestAnimationFrame(() => requestAnimationFrame(r)); })`);
      await page.screenshot({ path: `.scratch/online/copy-${String(w)}.png` });
      const m = await sizes(['onlineRoleHost', 'onlineRoleJoin', 'onlinePasteOffer', 'onlineCopyAnswer']);
      expect(m.over).toBeLessThanOrEqual(0);
      await expect(page.getByRole('link', { name: 'Back' })).toHaveCount(1);
      expect(m.small).toEqual([]);
      expect(hostSizes).toEqual({ over: 0, small: [] });
    } finally {
      await ctx.close();
    }
  });
}
