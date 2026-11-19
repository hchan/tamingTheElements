/**
 * Rewrites `tools/ci/e2e-durations.json` (seconds and test count per spec) from a Playwright `results.json`.
 *   corepack pnpm e2e:durations -- --from <results.json> [--write] [--orphans] [--sha <sha>] [--upper-bound a.spec.ts,b.spec.ts]
 * Without `--write` it prints the diff against the current file and changes nothing.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { durationsPath, listSpecs, listSrc, loadRules, orphanSpecs, type Durations } from './touched-specs';

type PwSpec = { title: string; tags?: string[]; file: string; tests: { results: { duration: number }[] }[] };
type PwSuite = { title?: string; file?: string; specs?: PwSpec[]; suites?: PwSuite[] };
export type PwResults = { suites: PwSuite[]; config?: { rootDir?: string } };

const norm = (file: string, rootDir?: string): string => {
  let f = file.replace(/\\/g, '/');
  if (rootDir && f.startsWith(`${rootDir}/`)) f = f.slice(rootDir.length + 1);
  return f.replace(/^tests\/e2e\//, '');
};

/** Sum `results[0].duration` per spec file (paths relative to tests/e2e), count tests, and aggregate `@smoke`. */
export function summarize(res: PwResults, meta: { source: string; sha: string; recordedAt: string }, upperBound: string[] = []): Durations {
  const ms: Record<string, number> = {};
  const n: Record<string, number> = {};
  let smokeMs = 0;
  let smokeN = 0;
  const walk = (s: PwSuite, titles: string[]): void => {
    const t = s.title ? [...titles, s.title] : titles;
    for (const sp of s.specs ?? []) {
      const f = norm(sp.file, res.config?.rootDir);
      const d = sp.tests.reduce((a, tt) => a + (tt.results[0]?.duration ?? 0), 0);
      ms[f] = (ms[f] ?? 0) + d;
      n[f] = (n[f] ?? 0) + sp.tests.length;
      if ((sp.tags ?? []).includes('smoke') || [...t, sp.title].join(' ').includes('@smoke')) {
        smokeMs += d;
        smokeN += sp.tests.length;
      }
    }
    for (const c of s.suites ?? []) walk(c, t);
  };
  for (const s of res.suites) walk(s, []);
  const ub = new Set(upperBound);
  const specs: Durations['specs'] = {};
  for (const f of Object.keys(ms).sort()) specs[f] = { sec: Math.round((ms[f] as number) / 1000), tests: n[f] as number, ...(ub.has(f) ? { upperBound: true as const } : {}) };
  return { schema: 1, ...meta, smoke: { sec: Math.round(smokeMs / 1000), tests: smokeN }, specs };
}

/** Keys sorted, one spec per line, so diffs stay small. */
export function renderDurations(d: Durations): string {
  const line = (v: Durations['specs'][string]): string => `{ "sec": ${v.sec}, "tests": ${v.tests}${v.upperBound ? ', "upperBound": true' : ''} }`;
  const specs = Object.keys(d.specs)
    .sort()
    .map((k) => `    ${JSON.stringify(k)}: ${line(d.specs[k] as Durations['specs'][string])}`)
    .join(',\n');
  return [
    '{',
    `  "schema": 1,`,
    `  "source": ${JSON.stringify(d.source)},`,
    `  "sha": ${JSON.stringify(d.sha)},`,
    `  "recordedAt": ${JSON.stringify(d.recordedAt)},`,
    `  "smoke": { "sec": ${d.smoke.sec}, "tests": ${d.smoke.tests} },`,
    '  "specs": {',
    specs,
    '  }',
    '}',
    '',
  ].join('\n');
}

export type DurationsDiff = { moved: { spec: string; from: number; to: number }[]; added: string[]; removed: string[] };

/** Specs that moved by more than 20%, specs added and specs removed. */
export function diffDurations(oldD: Durations, newD: Durations): DurationsDiff {
  const moved: DurationsDiff['moved'] = [];
  for (const [spec, v] of Object.entries(newD.specs)) {
    const o = oldD.specs[spec];
    if (!o) continue;
    const base = Math.max(o.sec, 1);
    if (Math.abs(v.sec - o.sec) / base > 0.2) moved.push({ spec, from: o.sec, to: v.sec });
  }
  return {
    moved,
    added: Object.keys(newD.specs).filter((s) => !oldD.specs[s]),
    removed: Object.keys(oldD.specs).filter((s) => !newD.specs[s]),
  };
}

function main(argv: string[]): number {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const val = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const from = val('--from');
  if (!from) {
    console.error('usage: e2e:durations -- --from <results.json> [--write] [--orphans] [--sha <sha>] [--upper-bound <ids,comma>]');
    return 2;
  }
  let oldD: Durations | undefined;
  try {
    oldD = JSON.parse(readFileSync(durationsPath, 'utf8')) as Durations;
  } catch {
    oldD = undefined;
  }
  const sha = val('--sha') ?? execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const upper = val('--upper-bound')?.split(',').filter(Boolean) ?? Object.entries(oldD?.specs ?? {}).filter(([, v]) => v.upperBound).map(([k]) => k);
  const res = JSON.parse(readFileSync(from, 'utf8')) as PwResults;
  const source = basename(dirname(from)) || from;
  const next = summarize(res, { source, sha, recordedAt: new Date().toISOString() }, upper);
  const specCount = Object.keys(next.specs).length;
  const testCount = Object.values(next.specs).reduce((a, v) => a + v.tests, 0);
  console.log(`${specCount} specs, ${testCount} tests, smoke ${next.smoke.tests} tests in ${next.smoke.sec} s`);
  if (oldD) {
    const d = diffDurations(oldD, next);
    for (const m of d.moved) console.log(`moved >20%: ${m.spec} ${m.from}s -> ${m.to}s`);
    for (const a of d.added) console.log(`added: ${a}`);
    for (const r of d.removed) console.log(`removed: ${r}`);
  }
  if (args.includes('--orphans')) {
    const all = listSpecs();
    console.log(`specs missing from the durations file: ${all.filter((s) => !next.specs[s]).join(', ') || 'none'}`);
    console.log(`specs no rule reaches: ${orphanSpecs(all, loadRules(), listSrc()).join(', ') || 'none'}`);
  }
  if (args.includes('--write')) {
    writeFileSync(durationsPath, renderDurations(next));
    console.log(`wrote ${durationsPath}`);
  }
  return 0;
}

if (process.argv[1]?.endsWith('e2e-durations.ts')) process.exit(main(process.argv.slice(2)));
