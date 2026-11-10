import { describe, expect, it } from 'vitest';
import { REPO_URL, aboutModel } from './about';

describe('aboutModel', () => {
  const m = aboutModel({ VITE_APP_VERSION: '1.2.3', VITE_APP_COMMIT: 'abc1234' });
  it('links to the GitHub repository and exposes no email address', () => {
    expect(m.contactUrl).toBe(REPO_URL);
    expect(JSON.stringify(m)).not.toMatch(/@|mailto/i);
  });
  it('includes author, credits and the version stamp', () => {
    expect(m.author).toBe('Henry Chan');
    expect(m.credits.length).toBeGreaterThan(0);
    expect(m.version).toBe('v1.2.3 (abc1234)');
  });
});
