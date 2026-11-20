import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseKnownRed } from '../../tools/ci/known-red';

const root = resolve(__dirname, '../..');
const raw = JSON.parse(readFileSync(join(root, 'tools/ci/known-red.json'), 'utf8')) as { schema?: unknown; entries?: unknown };

describe('tools/ci/known-red.json', () => {
  it('has schema 1 and an entries array', () => {
    expect(raw.schema).toBe(1);
    expect(Array.isArray(raw.entries)).toBe(true);
  });

  it('every entry is complete and links an existing ideas/ file', () => {
    for (const e of raw.entries as Record<string, unknown>[]) {
      expect(typeof e['file'], 'file').toBe('string');
      expect(String(e['file'])).toMatch(/^tests\/e2e\/.+\.spec\.ts$/);
      expect(existsSync(join(root, String(e['file']))), `spec exists: ${String(e['file'])}`).toBe(true);
      expect(String(e['titleIncludes']).length, 'titleIncludes').toBeGreaterThan(0);
      expect(['P0', 'P1', 'P2']).toContain(e['tier']);
      expect(String(e['firstSeen'])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['open', 'fixed']).toContain(e['status']);
      expect(String(e['idea'])).toMatch(/^ideas\/.+\.md$/);
      expect(existsSync(join(root, String(e['idea']))), `idea exists: ${String(e['idea'])}`).toBe(true);
    }
  });
});

describe('parseKnownRed', () => {
  const ok = { file: 'tests/e2e/a.spec.ts', titleIncludes: 'x' };
  it('accepts object or bare array, drops malformed and fixed rows', () => {
    expect(parseKnownRed({ entries: [ok, { file: 1 }, null, { ...ok, titleIncludes: '' }, { ...ok, status: 'fixed' }] })).toEqual([ok]);
    expect(parseKnownRed([ok])).toEqual([ok]);
    expect(parseKnownRed(null)).toEqual([]);
    expect(parseKnownRed('x')).toEqual([]);
  });
});
