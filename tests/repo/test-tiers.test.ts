import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadTiers, tierOf } from '../../tools/ci/test-tiers';

const specs = readdirSync('tests/e2e').filter((f) => f.endsWith('.spec.ts'));
const data = loadTiers();

describe('tools/ci/test-tiers.json', () => {
  it('has a per-file tier for every e2e spec', () => {
    expect(specs.filter((f) => !(f in data.files))).toEqual([]);
  });
  it('names no missing spec file', () => {
    expect(Object.keys(data.files).filter((f) => !specs.includes(f))).toEqual([]);
  });
  it('every override names an existing spec file', () => {
    expect(data.overrides.filter((o) => !specs.includes(o.file)).map((o) => o.file)).toEqual([]);
  });
  it('only uses valid tiers', () => {
    const all = [...Object.values(data.files), ...data.overrides.map((o) => o.tier), ...data.titleRules.map((r) => r.tier)];
    expect(all.filter((t) => !['P0', 'P1', 'P2'].includes(t))).toEqual([]);
  });
});

describe('tierOf', () => {
  it('@smoke always wins', () => {
    expect(tierOf('tests/e2e/no-touch-stick.spec.ts', 'anything', ['@smoke'])).toBe('P0');
    expect(tierOf('responsive.spec.ts', 'a touch title the rule would demote', ['@smoke'])).toBe('P0');
  });
  it('overrides beat the file tier', () => {
    expect(tierOf('match-end.spec.ts', 'a draw at the time limit')).toBe('P1');
    expect(tierOf('perf.spec.ts', 'stepped battle frame time')).toBe('P2');
  });
  it('title rules drop P1 tests to P2 but spare P0 files', () => {
    expect(tierOf('arcade-pan.spec.ts', 'pans in reduced motion')).toBe('P2');
    expect(tierOf('guide.spec.ts', 'Help on a phone')).toBe('P2');
    expect(tierOf('smoke.spec.ts', 'phone menu loads')).toBe('P0');
  });
  it('falls back to the file tier, then the default', () => {
    expect(tierOf('ko-fx-shot.spec.ts', 'plain')).toBe('P2');
    expect(tierOf('guide.spec.ts', 'plain')).toBe('P1');
    expect(tierOf('brand-new.spec.ts', 'plain')).toBe(data.defaultTier);
  });
});
