import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const doc = readFileSync(resolve(root, 'docs/PARITY.md'), 'utf8');
const knownBugs = readFileSync(resolve(root, 'docs/legacy/KNOWN-BUGS.md'), 'utf8');

const STATUSES = ['matches', 'intentional divergence', 'open'] as const;
const TEST_LINE = /\b(it|test|describe)(\.\w+)*(\(|\.each)/;
const FAILS_LINE = /\bit\.fails\(/;

interface Row {
  id: string;
  status: string;
  evidence: string;
}

const rows: Row[] = doc
  .split('\n')
  .filter((l) => /^\| [A-Z]\d+ \|/.test(l))
  .map((l) => {
    const cells = l.split('|').map((c) => c.trim());
    return { id: cells[1] ?? '', status: cells[5] ?? '', evidence: cells[6] ?? '' };
  });

function refsOf(evidence: string): string[] {
  return [...evidence.matchAll(/`([^`]+#[^`]+)`/g)].map((m) => m[1] as string);
}

/** Returns an error string, or null when the reference resolves to a test declaration. */
function resolveRef(ref: string, allowFails: boolean): string | null {
  const at = ref.indexOf('#');
  const path = ref.slice(0, at);
  const title = ref.slice(at + 1);
  const file = resolve(root, path);
  if (!existsSync(file)) return `${ref}: file not found`;
  const hits = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.includes(title) && TEST_LINE.test(l));
  if (hits.length === 0) return `${ref}: no test declaration contains this title`;
  if (!allowFails && hits.every((l) => FAILS_LINE.test(l))) return `${ref}: only an it.fails matches`;
  return null;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('docs/PARITY.md', () => {
  it('has rows with unique ids and a valid status', () => {
    expect(rows.length).toBeGreaterThan(50);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.filter((r) => !(STATUSES as readonly string[]).includes(r.status)).map((r) => r.id)).toEqual([]);
  });

  it('every matches row cites at least one test, and every row cites something', () => {
    const bad = rows.filter((r) =>
      r.status === 'matches' ? refsOf(r.evidence).length === 0 : r.evidence === '',
    );
    expect(bad.map((r) => r.id)).toEqual([]);
  });

  it('every cited test exists, and no matches row relies on an it.fails', () => {
    const errors = rows.flatMap((r) =>
      refsOf(r.evidence).flatMap((ref) => resolveRef(ref, r.status !== 'matches') ?? []),
    );
    expect(errors).toEqual([]);
  });

  it('every row that cites a tests/oracle test says so (oracle-only evidence needs pnpm oracle:restore)', () => {
    const unmarked = rows.filter((r) => r.evidence.includes('tests/oracle/') && !r.evidence.includes('oracle-only'));
    expect(unmarked.map((r) => r.id)).toEqual([]);
  });

  it('every open row is listed under Open items', () => {
    const openSection = doc.slice(doc.indexOf('## Open items'));
    const missing = rows.filter((r) => r.status === 'open' && !openSection.includes(`- ${r.id}:`));
    expect(missing.map((r) => r.id)).toEqual([]);
  });

  it('mentions every known-bug slug from KNOWN-BUGS.md and every KNOWN-BUG tag in the code', () => {
    const fromTable = [...knownBugs.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1] as string);
    const fromCode = ['src', 'tests'].flatMap((d) =>
      sourceFiles(resolve(root, d))
        .filter((f) => !f.endsWith('parity.test.ts'))
        .flatMap((f) =>
        [...readFileSync(f, 'utf8').matchAll(/KNOWN-BUG[: ]([a-z0-9-]+)/g)].map((m) => m[1] as string),
      ),
    );
    const slugs = [...new Set([...fromTable, ...fromCode])];
    expect(slugs.length).toBeGreaterThan(10);
    expect(slugs.filter((s) => !doc.includes(`\`${s}\``))).toEqual([]);
  });
});
