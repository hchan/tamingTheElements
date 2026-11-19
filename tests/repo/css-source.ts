import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Reader = (path: string) => string;

const IMPORT_LINE = /^[ \t]*@import\s+(?:url\()?\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)?\s*;[ \t]*\r?\n?/gm;

/** Returns the CSS at `file` with each relative `@import '<path>';` line replaced, recursively, by the target's content. */
export function readCssBundle(file: string, read: Reader = (p) => readFileSync(p, 'utf8'), seen: readonly string[] = []): string {
  const abs = resolve(file);
  if (seen.includes(abs)) throw new Error(`CSS @import cycle: ${[...seen, abs].join(' -> ')}`);
  const src = read(abs);
  return src.replace(IMPORT_LINE, (_m, _q, rel: string) =>
    readCssBundle(resolve(dirname(abs), rel), read, [...seen, abs]),
  );
}

/** src/ui/styles/main.css with its partials inlined (main.css is an import list; the rules live in src/ui/styles/main/NN-*.css). */
export function readMainCss(): string {
  return readCssBundle(resolve(import.meta.dirname, '../../src/ui/styles/main.css'));
}
