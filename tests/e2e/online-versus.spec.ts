import { expect, type Page, test } from '@playwright/test';

/**
 * Waits for the Rematch button on `page` by sim progress, not wall-clock: a loaded machine runs the two-page match slowly
 * (SwiftShader, background-tab throttling), so the only failure is a match whose tick stops advancing for `stallMs`.
 */
async function waitForMatchEnd(page: Page, stallMs = 20_000): Promise<void> {
  const again = page.locator('#onlineAgain');
  let last = -1;
  let lastMove = Date.now();
  while (!(await again.isVisible())) {
    const tick = await page.evaluate<number>('window.__TTE__?.state().tick ?? 0');
    if (tick !== last) {
      last = tick;
      lastMove = Date.now();
    } else if (Date.now() - lastMove > stallMs) {
      throw new Error(`match stalled at tick ${String(tick)} for ${String(stallMs)} ms without a Rematch button`);
    }
    await again.waitFor({ state: 'visible', timeout: 1_000 }).catch(() => undefined);
  }
}

// The #online screen end to end in two real pages: host code -> answer code -> link opens -> setup handshake says "Connected".
// Once as plain lockstep and once with `?ff=rollback` (input prediction, docs/NETCODE.md): both must run and agree.
for (const ff of ['arcade', 'arcade,rollback']) test(`two players connect through the Online Versus screen with pasted codes (${ff})`, async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  await a.goto(`/?ff=${ff}`);
  await b.goto(`/?ff=${ff}`);
  await expect(a.getByRole('button', { name: 'Online', exact: true })).toBeVisible();
  await a.getByRole('button', { name: 'Online', exact: true }).click();
  await b.goto(`/?ff=${ff}#online`);
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
  await a.locator('#onlineRace').selectOption({ index: 0 });
  await b.locator('#onlineRace').selectOption({ index: 2 });
  await a.locator('#onlineReady').click();
  await b.locator('#onlineReady').click();
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

// The Rematch flow: with `?matchticks=` the match ends as a draw quickly; both sides get a Rematch button, pick again and a second match (a new match number) runs.
test('a finished online match offers a Rematch that starts a second match', async ({ browser }) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const q = '/?ff=arcade&matchticks=120';
  await a.goto(q);
  await b.goto(`${q}#online`);
  await a.getByRole('button', { name: 'Online', exact: true }).click();
  await a.locator('#onlineHost').click();
  await expect(a.locator('#onlineOffer')).not.toHaveValue('', { timeout: 15_000 });
  await b.locator('#onlineOfferIn').fill(await a.locator('#onlineOffer').inputValue());
  await b.locator('#onlineJoin').click();
  await expect(b.locator('#onlineAnswer')).not.toHaveValue('', { timeout: 15_000 });
  await a.locator('#onlineAnswerIn').fill(await b.locator('#onlineAnswer').inputValue());
  await a.locator('#onlineConnect').click();
  for (const round of [1, 2]) {
    for (const page of [a, b]) await page.locator('#onlineReady').click();
    for (const page of [a, b]) await waitForMatchEnd(page);
    for (const page of [a, b]) await expect(page.locator('#onlineAgain')).toBeVisible();
    for (const page of [a, b]) await expect(page.locator('#onlineStatus')).toContainText('draw');
    if (round === 1) for (const page of [a, b]) await page.locator('#onlineAgain').click();
  }
});
