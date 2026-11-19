/**
 * E2E test tiers: P0 core flow, P1 features, P2 polish/edge. Data lives in `test-tiers.json`; `tierOf` is pure.
 * Resolution order: @smoke tag, per-test overrides (first match), title rules (skipped when the file tier is
 * `exceptTier`), per-file tier, `defaultTier`. See docs/TESTING.md "E2E test tiers".
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export type Tier = 'P0' | 'P1' | 'P2';
export type TierOverride = { file: string; titleIncludes: string; tier: Tier };
export type TitleRule = { titleMatches: string; tier: Tier; exceptTier?: Tier };
export type TierData = {
  schema: 1;
  defaultTier: Tier;
  files: Record<string, Tier>;
  overrides: TierOverride[];
  titleRules: TitleRule[];
};

export const TIERS_PATH = new URL('./test-tiers.json', import.meta.url);

export function loadTiers(): TierData {
  return JSON.parse(readFileSync(TIERS_PATH, 'utf8')) as TierData;
}

/** Tier of one test. `file` may be a path (only the basename is used); `tags` are Playwright tags such as `@smoke`. */
export function tierOf(file: string, title: string, tags: readonly string[] = [], data: TierData = loadTiers()): Tier {
  if (tags.includes('@smoke')) return 'P0';
  const name = basename(file);
  const lower = title.toLowerCase();
  const hit = data.overrides.find((o) => o.file === name && lower.includes(o.titleIncludes.toLowerCase()));
  if (hit) return hit.tier;
  const fileTier = data.files[name] ?? data.defaultTier;
  for (const rule of data.titleRules) {
    if (fileTier !== rule.exceptTier && new RegExp(rule.titleMatches, 'i').test(title)) return rule.tier;
  }
  return fileTier;
}
