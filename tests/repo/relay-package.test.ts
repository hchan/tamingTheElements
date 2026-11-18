import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// src/core/relay is published as @tamingtheelements/relay (docs/RELAY-PACKAGE.md): its sources must stay self-contained, and
// nothing else in src/core (the sim step) may depend on it. The relay is exempt from the no-async rule only because of that.
const root = resolve(import.meta.dirname, '../..');
const relayDir = resolve(root, 'src/core/relay');
const relaySources = readdirSync(relayDir).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
);
const importsOf = (src: string): string[] =>
  [...src.matchAll(/\bfrom\s+'([^']+)'/g)].map((m) => m[1] as string);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)],
  );
}

describe('relay package', () => {
  it('has self-contained sources (only ./ imports)', () => {
    for (const f of relaySources) {
      for (const spec of importsOf(readFileSync(resolve(relayDir, f), 'utf8'))) {
        expect(spec.startsWith('./'), `${f} imports ${spec}`).toBe(true);
      }
    }
  });
  it('is not imported by the rest of src/core', () => {
    const offenders = walk(resolve(root, 'src/core'))
      .filter((f) => f.endsWith('.ts') && !f.startsWith(relayDir))
      .filter((f) => importsOf(readFileSync(f, 'utf8')).some((s) => /(^|\/)relay(\/|$)/.test(s)));
    expect(offenders).toEqual([]);
  });
  it('declares the documented entrypoints', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'packages/relay/package.json'), 'utf8')) as {
      name: string;
      version: string;
      exports: Record<string, unknown>;
      files: string[];
    };
    expect(pkg.name).toBe('@tamingtheelements/relay');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Object.keys(pkg.exports)).toEqual(['.', './testing', './package.json']);
    expect(pkg.files).toEqual(['dist']);
    const doc = readFileSync(resolve(root, 'docs/RELAY-PACKAGE.md'), 'utf8');
    expect(doc).toContain(pkg.name);
    expect(doc).toContain('@tamingtheelements/relay/testing');
  });
  it('exposes the protocol version the spec pins', () => {
    const c = readFileSync(resolve(relayDir, 'constants.ts'), 'utf8');
    expect(c).toMatch(/PROTOCOL_VERSION = 1;/);
  });
});
