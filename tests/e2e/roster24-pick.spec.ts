import { expect, test } from '@playwright/test';
import { ROSTER_24_CHARACTERS } from '../../src/core/data/characters';
import { CHARACTER_TEXT } from '../../src/core/data/text-ids';
import { ARENA_READY, START, collectErrors } from './parity/helpers';
import { waitFor } from './support/wait';

// Every hidden roster24 hero can be picked behind ?ff=roster24 and boots a real Arcade arena as the player's character: no
// console errors after 200 ticks and the player's active character (`bench()`, team 0) has the picked hero's display name (Arcade scales max health,
// so it is no identity check). Long gate (no @smoke): 12 heroes x an arena boot, about 90 s in all.
for (const hero of ROSTER_24_CHARACTERS) {
  const slug = String(hero.id);
  test(`${slug}: picked under Your race boots the arena as the player's hero`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&ff=arcade,roster24#arcade`);
    await page.getByLabel('Your race').selectOption(slug);
    await page.getByLabel('AI race').selectOption('fiara');
    await page.getByRole('button', { name: 'Fight!' }).click();
    await waitFor(page, 'arena ready', ARENA_READY);
    await page.evaluate('window.__TTE__.arena.step(200)');
    const rows = await page.evaluate<{ name: string; active: boolean }[]>(`window.__TTE__.arena.bench().map((b) => ({ name: b.name, active: b.active }))`);
    expect(rows.filter((r) => r.active).map((r) => r.name)).toEqual([CHARACTER_TEXT.get(hero.id)?.name]);
    expect(errors).toEqual([]);
  });
}
