import { expect, test, type Page } from '@playwright/test';
import { ARENA_READY, START, characters, collectErrors } from './parity/helpers';

// QA r12: the round-end panel was never reached by hand. Force the KO deterministically (setHp, then stepped ticks) and
// screenshot the panel; the wording is asserted on the result card and the page text.

const rounds = (page: Page): Promise<{ result: { visible: boolean; title: string } } | undefined> =>
  page.evaluate(`window.__TTE__.arena.rounds()`);
const step = (page: Page, n: number): Promise<unknown> => page.evaluate(`window.__TTE__.arena.step(${String(n)})`);

async function koRound(page: Page, team: number): Promise<void> {
  await page.goto(`${START}&ff=arcade#arcade`);
  await page.getByRole('button', { name: 'Fight!' }).click();
  await page.waitForFunction(ARENA_READY);
  await step(page, 101);
  const [who] = await characters(page, team);
  await page.evaluate(`(() => { const a = window.__TTE__.arena; a.setHp(${String(who?.id)}, 0); a.step(1); })()`);
  await step(page, 150);
}

for (const [team, title] of [[1, 'ROUND 1 WON'], [0, 'ROUND 1 LOST']] as const) {
  test(`round-end panel reads ${title}`, async ({ page }, info) => {
    const errors = collectErrors(page);
    await koRound(page, team);
    const r = await rounds(page);
    expect(r?.result.visible).toBe(true);
    expect(r?.result.title).toBe(title);
    await page.screenshot({ path: info.outputPath(`round-end-${title.replace(/ /g, '-')}.png`) });
    const text = await page.evaluate<string>(`document.body.innerText`);
    expect(text).not.toMatch(/classic|arcade|ruleset|capture/i);
    expect(errors).toEqual([]);
  });
}
