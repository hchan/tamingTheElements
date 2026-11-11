import { expect, test } from '@playwright/test';

// The #online screen end to end in two real pages: host code -> answer code -> link opens -> setup handshake says "Connected".
test('two players connect through the Online Versus screen with pasted codes', async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  await a.goto('/?ff=arcade');
  await b.goto('/?ff=arcade');
  await expect(a.getByRole('button', { name: 'Online Versus' })).toBeVisible();
  await a.getByRole('button', { name: 'Online Versus' }).click();
  await b.goto('/?ff=arcade#online');
  await expect(a.locator('#onlineHost')).toBeVisible();
  await expect(b.locator('#onlineJoin')).toBeVisible();

  await a.locator('#onlineHost').click();
  await expect(a.locator('#onlineOffer')).not.toHaveValue('', { timeout: 15_000 });
  const offer = await a.locator('#onlineOffer').inputValue();

  await b.locator('#onlineOfferIn').fill(offer);
  await b.locator('#onlineJoin').click();
  await expect(b.locator('#onlineAnswer')).not.toHaveValue('', { timeout: 15_000 });
  const answer = await b.locator('#onlineAnswer').inputValue();

  await a.locator('#onlineAnswerIn').fill(answer);
  await a.locator('#onlineConnect').click();
  await expect(a.locator('#onlineStatus')).toContainText('Connected. Both games', { timeout: 20_000 });
  await expect(b.locator('#onlineStatus')).toContainText('Connected. Both games', { timeout: 20_000 });
  // The match then runs in lockstep on both pages: the shared sim advances on each and nobody reports a desync.
  for (const page of [a, b]) {
    await expect.poll(() => page.evaluate<number>('window.__TTE__.state().tick'), { timeout: 30_000 }).toBeGreaterThan(150);
  }
  await expect(a.locator('#onlineStatus')).not.toContainText('disagree');
  await expect(b.locator('#onlineStatus')).not.toContainText('disagree');
});

test('a junk code is refused in words, not a crash', async ({ page }) => {
  await page.goto('/?ff=arcade#online');
  await page.locator('#onlineOfferIn').fill('not a code');
  await page.locator('#onlineJoin').click();
  await expect(page.locator('#onlineStatus')).toContainText('not a connection code');
});
