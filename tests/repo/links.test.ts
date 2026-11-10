import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const files = [
  'README.md',
  'CONTRIBUTING.md',
  ...readdirSync(resolve(root, 'docs'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/${f}`),
];

const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

describe('markdown links', () => {
  it.each(files)('%s: relative links resolve', (file) => {
    const text = readFileSync(resolve(root, file), 'utf8').replace(/```[\s\S]*?```/g, '');
    const broken: string[] = [];
    for (const m of text.matchAll(linkRe)) {
      const target = m[1] ?? '';
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      const path = target.split('#')[0] ?? '';
      if (path && !existsSync(resolve(root, dirname(file), path))) broken.push(target);
    }
    expect(broken).toEqual([]);
  });
});
