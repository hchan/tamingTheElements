import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LINE = 'VITE_ONLINE_URL: ${{ vars.VITE_ONLINE_URL }}';
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

/** Every step block (a `- ` list item at step indent) with its `name:` if any. */
const steps = ci.split(/\n(?= {6}- )/).slice(1);
const stepName = (s: string): string => /^ {6}- (?:name: )?(.*)$/m.exec(s)?.[1] ?? '';

describe('ci.yml Pages online relay URL', () => {
  it('passes the public relay URL variable only to the Build for Pages step', () => {
    const withLine = steps.filter((s) => s.includes(LINE));
    expect(withLine.map(stepName)).toEqual(['Build for Pages']);
    expect(ci.split(LINE).length - 1).toBe(1);
  });
});
