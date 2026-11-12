import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = resolve(import.meta.dirname, '../../ideas');
const STATUSES = ['idea', 'planned', 'in-progress', 'done'];
/** Work-in-progress limit for the queue of unfinished ideas; raise it on purpose, with a reason in the commit. */
const MAX_OPEN = 12;

const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md');
const status = (f: string): string => /^status: (\S+)$/m.exec(readFileSync(resolve(dir, f), 'utf8'))?.[1] ?? '';

describe('ideas/', () => {
  it.each(files)('%s has a valid status', (f) => {
    expect(STATUSES).toContain(status(f));
  });

  it('keeps the open queue within the limit', () => {
    const open = files.filter((f) => status(f) !== 'done');
    expect(open.length).toBeLessThanOrEqual(MAX_OPEN);
  });
});
