import { expect, test } from '@playwright/test';
import { START } from './parity/helpers';

// QA r28: the 2v2 choice is a role=radio inside a radiogroup, not a button: getByRole('button') never matches it, getByRole('radio') does.
test('2v2 tag team is a radio in the Team radiogroup, not a button', async ({ page }) => {
  await page.goto(`${START}&ff=arcade#arcade`);
  await expect(page.getByRole('radio', { name: '2v2 tag team' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '2v2 tag team' })).toHaveCount(0);
});
