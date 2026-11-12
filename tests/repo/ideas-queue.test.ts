import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** ideas/<folder>/*.md: the folder says where an idea stands; `status:` in the front matter must agree. There is no cap. */
const dir = resolve(import.meta.dirname, '../../ideas');
const FOLDERS: Record<string, string[]> = { brainstorm: ['idea', 'planned'], 'in-progress': ['in-progress'], done: ['done'] };
const status = (path: string): string => /^status: (\S+)$/m.exec(readFileSync(path, 'utf8'))?.[1] ?? '';

describe('ideas/', () => {
  it('has only the three folders (and the README)', () => {
    expect(readdirSync(dir).filter((f) => f !== 'README.md').sort()).toEqual(Object.keys(FOLDERS).sort());
  });
  for (const [folder, allowed] of Object.entries(FOLDERS)) {
    const files = readdirSync(resolve(dir, folder)).filter((f) => f.endsWith('.md'));
    it.each(files)(`${folder}/%s has a status that matches its folder`, (f) => {
      expect(allowed).toContain(status(resolve(dir, folder, f)));
    });
  }
});
