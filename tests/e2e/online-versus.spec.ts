import { type BrowserContext, expect, type Page, test } from '@playwright/test';

// Contexts the two-page tests open; closed after each test so WebRTC peers and running sims do not load the shared worker browser for later specs (perf).
const opened: BrowserContext[] = [];
test.afterEach(async () => {
  for (const c of opened.splice(0)) await c.close();
});

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
// Once as plain lockstep (`?ff=lockstep`) and once in the rollback default (input prediction, docs/NETCODE.md): both must run and agree.
for (const ff of ['arcade,lockstep', 'arcade']) test(`two players connect through the Online Versus screen with pasted codes (${ff})`, { tag: ff === 'arcade' ? '@smoke' : [] }, async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  opened.push(ctx);
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  await a.goto(`/?ff=${ff}&ice=none`);
  await b.goto(`/?ff=${ff}&ice=none`);
  await expect(a.getByRole('button', { name: 'Online', exact: true })).toBeVisible();
  await a.getByRole('button', { name: 'Online', exact: true }).click();
  await b.goto(`/?ff=${ff}&ice=none#online`);
  await expect(a.locator('#onlineRoleHost')).toBeVisible();
  await expect(b.locator('#onlineRoleJoin')).toBeVisible();

  await a.locator('#onlineRoleHost').click();
  await expect(a.locator('#onlineOffer')).not.toHaveValue('', { timeout: 15_000 });
  const offer = await a.locator('#onlineOffer').inputValue();

  await b.locator('#onlineRoleJoin').click();
  await b.locator('#onlineOfferIn').fill(offer);
  await b.locator('#onlineJoin').click();
  await expect(b.locator('#onlineAnswer')).not.toHaveValue('', { timeout: 15_000 });
  const answer = await b.locator('#onlineAnswer').inputValue();

  await a.locator('#onlineAnswerIn').fill(answer);
  await expect(a.locator('#onlineRace')).toBeVisible({ timeout: 15_000 }); // pasting the reply connects by itself
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
  await page.locator('#onlineRoleJoin').click();
  await page.locator('#onlineOfferIn').fill('not a code');
  await page.locator('#onlineJoin').click();
  await expect(page.locator('#onlineFailure')).toContainText('not a connection code');
});

// The Rematch flow: with `?matchticks=` the match ends as a draw quickly; both sides get a Rematch button, pick again and a second match (a new match number) runs.
test('a finished online match offers a Rematch that starts a second match', async ({ browser }) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext();
  opened.push(ctx);
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const q = '/?ff=arcade&matchticks=120&ice=none';
  await a.goto(q);
  await b.goto(`${q}#online`);
  await a.getByRole('button', { name: 'Online', exact: true }).click();
  await a.locator('#onlineRoleHost').click();
  await expect(a.locator('#onlineOffer')).not.toHaveValue('', { timeout: 15_000 });
  await b.locator('#onlineRoleJoin').click();
  await b.locator('#onlineOfferIn').fill(await a.locator('#onlineOffer').inputValue());
  await b.locator('#onlineJoin').click();
  await expect(b.locator('#onlineAnswer')).not.toHaveValue('', { timeout: 15_000 });
  await a.locator('#onlineAnswerIn').fill(await b.locator('#onlineAnswer').inputValue());
  await expect(a.locator('#onlineRace')).toBeVisible({ timeout: 15_000 }); // pasting the reply connects by itself
  for (const round of [1, 2]) {
    for (const page of [a, b]) await page.locator('#onlineReady').click();
    for (const page of [a, b]) await waitForMatchEnd(page);
    for (const page of [a, b]) await expect(page.locator('#onlineAgain')).toBeVisible();
    for (const page of [a, b]) await expect(page.locator('#onlineStatus')).toContainText('draw');
    if (round === 1) for (const page of [a, b]) await page.locator('#onlineAgain').click();
  }
});

// WP03: the joiner opens the host's join link (`?join=<code>#online`): Join starts at once, the param is stripped, the match connects.
test('opening the host join link starts Join at once and the match connects', async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext();
  opened.push(ctx);
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  await a.goto('/?ff=arcade&ice=none#online');
  await a.locator('#onlineRoleHost').click();
  await expect(a.locator('#onlineOffer')).not.toHaveValue('', { timeout: 15_000 });
  await expect(a.locator('#onlineQr svg')).toBeVisible();
  const offer = await a.locator('#onlineOffer').inputValue();
  await b.goto(`/?ff=arcade&ice=none&join=${encodeURIComponent(offer)}#online`);
  await expect(b.locator('#onlineAnswer')).not.toHaveValue('', { timeout: 15_000 });
  expect(b.url()).not.toContain('join=');
  await expect(b.locator('#onlineOfferIn')).toHaveValue(offer);
  await a.locator('#onlineAnswerIn').fill(await b.locator('#onlineAnswer').inputValue());
  await expect(a.locator('#onlineRace')).toBeVisible({ timeout: 15_000 }); // pasting the reply connects by itself
  await a.locator('#onlineReady').click();
  await b.locator('#onlineReady').click();
  for (const page of [a, b]) {
    await expect(page.locator('#onlineStatus')).toContainText('Connected. Both games', { timeout: 20_000 });
    await expect.poll(() => page.evaluate<number>('window.__TTE__.state().tick'), { timeout: 30_000 }).toBeGreaterThan(150);
  }
});

// Online simplified: Host and Join are both visible on first load, and a ?join= link goes straight to Copy reply.
test('Host a game and Join a game are both visible on first load', async ({ page }) => {
  await page.goto('/?ff=arcade&ice=none#online');
  await expect(page.locator('#onlineRoleHost')).toBeVisible();
  await expect(page.locator('#onlineRoleJoin')).toBeVisible();
  await expect(page.locator('#onlineManual')).toBeVisible();
  await page.locator('#onlineRoleHost').click();
  await expect(page.locator('#onlineCopyLink')).toBeVisible({ timeout: 15_000 });
});

test('a ?join= link shows Copy reply with no extra choices', async ({ page }) => {
  await page.goto('/?ff=arcade&ice=none#online');
  await page.locator('#onlineRoleHost').click();
  await expect(page.locator('#onlineOffer')).not.toHaveValue('', { timeout: 15_000 });
  const offer = await page.locator('#onlineOffer').inputValue();
  await page.goto(`/?ff=arcade&ice=none&join=${encodeURIComponent(offer)}#online`);
  await expect(page.locator('#onlineCopyAnswer')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#onlineOfferIn')).toBeHidden();
});

// A failed link shows ONE message and ONE Try again; the stale paste/copy controls stay hidden until the retry.
test('a failed connection shows one message and one Try again', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/?ff=arcade&ice=none#online');
  await page.locator('#onlineRoleHost').click();
  await expect(page.locator('#onlineCopyLink')).toBeVisible({ timeout: 15_000 });
  await page.locator('#onlineAnswerIn').fill('not a real reply code');
  await page.locator('#onlineConnect').click();
  await expect(page.locator('#onlineFailure')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#onlineFailure')).toContainText('keeps this tab open on the Host screen');
  await expect(page.locator('#onlineHost')).toBeVisible();
  await expect(page.locator('#onlineHost')).toHaveText('Try again');
  for (const id of ['onlineConnect', 'onlinePasteAnswer', 'onlineCopyLink', 'onlineAnswerIn']) await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator('#onlineStatus')).toHaveText('');
  await page.screenshot({ path: '.scratch/online-fail-1280x720.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.scratch/online-fail-390x844.png' });
  await page.locator('#onlineHost').click();
  await expect(page.locator('#onlineFailure')).toBeHidden();
  await expect(page.locator('#onlineCopyLink')).toBeVisible({ timeout: 15_000 });
});
