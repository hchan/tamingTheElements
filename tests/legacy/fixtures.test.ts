import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The legacy game is no longer in the tree (git tag legacy-crafty-1.0; `pnpm oracle:restore`). What stays in the default
 * suite is the recorded evidence: the fixtures below were captured from the real legacy code and the port tests
 * (src/core/**) compare against them. `pnpm test:oracle` re-executes the legacy code and checks it still produces them.
 */
const DIR = resolve(import.meta.dirname, '../fixtures/legacy');

const FILES = [
  'abilities-effects.json',
  'abilities-range.json',
  'ability-descriptions.json',
  'ai.json',
  'data.json',
  'rules.json',
  'text.json',
];

function parse(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('recorded legacy fixtures', () => {
  it('has exactly the expected fixture files', () => {
    expect(readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()).toEqual([...FILES].sort());
  });

  it.each(FILES)('%s is non-empty JSON', (file) => {
    const value = parse(resolve(DIR, file)) as Record<string, unknown>;
    expect(Object.keys(value).length).toBeGreaterThan(0);
  });

  it('has the recorded legacy save snapshots', () => {
    const saves = readdirSync(resolve(DIR, 'saves')).filter((f) => f.endsWith('.json'));
    expect(saves.length).toBeGreaterThanOrEqual(8);
    for (const f of saves) expect(parse(resolve(DIR, 'saves', f))).toBeTruthy();
  });
});
