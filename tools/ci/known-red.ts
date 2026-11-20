import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** One recorded red e2e test ("ticket"). Matching: same spec basename, test title contains `titleIncludes`. */
export interface KnownRedEntry {
  readonly file: string;
  readonly titleIncludes: string;
  readonly tier?: string;
  readonly firstSeen?: string;
  readonly idea?: string;
  readonly status?: string;
}

/** Tolerant parse: accepts `{entries: [...]}` or a bare array, drops malformed rows and entries whose status is `fixed`. */
export function parseKnownRed(v: unknown): KnownRedEntry[] {
  const list: unknown = Array.isArray(v) ? v : (v as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(list)) return [];
  const out: KnownRedEntry[] = [];
  for (const e of list as unknown[]) {
    const r = e as Partial<KnownRedEntry> | null;
    if (!r || typeof r.file !== 'string' || typeof r.titleIncludes !== 'string' || r.titleIncludes === '') continue;
    if (r.status === 'fixed') continue;
    out.push(r as KnownRedEntry);
  }
  return out;
}

/** Load tools/ci/known-red.json under `root`; a missing or unreadable file means no entries. */
export function loadKnownRed(root: string): KnownRedEntry[] {
  try {
    return parseKnownRed(JSON.parse(readFileSync(join(root, 'tools/ci/known-red.json'), 'utf8')) as unknown);
  } catch {
    return [];
  }
}
