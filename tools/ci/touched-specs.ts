/**
 * Touched-spec selector for the tiered gate (T2): from the changed files, pick the e2e specs worth running before a
 * push. `selectSpecs` is pure (no I/O); the file helpers and the CLI at the bottom do the reading. Rules are data in
 * `touched-specs.json`, timings in `e2e-durations.json` (refreshed by `e2e-durations.ts`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';

export type Area = { area: string; globs: string[]; specs: string[]; narrow?: 'stem' };
export type Rules = {
  schema: 1;
  noE2e: string[];
  infra: string[];
  areas: Area[];
  broadAlways: string[];
  broadCapSec: number;
  budgetSec: number;
  maxTests: number;
};
export type Durations = {
  schema: 1;
  source: string;
  sha: string;
  recordedAt: string;
  smoke: { sec: number; tests: number };
  specs: Record<string, { sec: number; tests: number; upperBound?: true }>;
};
export type Selection = {
  specs: string[];
  deferred: string[];
  removed: string[];
  reasons: Record<string, string>;
  broad: boolean;
  noE2e: boolean;
  estSec: number;
  estTests: number;
};
export type SelectOpts = {
  budgetSec: number;
  maxTests: number;
  /** Specs (ids) that import the given tests/e2e file (id relative to tests/e2e), directly or transitively. */
  importers: (file: string) => string[];
  /** Number of `test(` calls in a spec's source, used only for specs missing from the durations file. */
  testsIn: (spec: string) => number;
};

const E2E_DIR = 'tests/e2e/';
const MAX_IMPORTERS = 20;
const UNKNOWN_SEC_PER_TEST = 25;
const UNKNOWN_SEC = 120;
const SPEC_RE = /\.spec\.ts$/;

/** Glob to RegExp: `**` (any depth), `*` (no slash), `?`, `{a,b}`. Everything else is literal. */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else if (c === '{') {
      out += '(?:';
      braces++;
    } else if (c === '}' && braces > 0) {
      out += ')';
      braces--;
    } else if (c === ',' && braces > 0) out += '|';
    else out += c.replace(/[.+^$()|[\]\\{}]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

const reCache = new Map<string, RegExp>();
function matches(globs: string[], file: string): boolean {
  return globs.some((g) => {
    let re = reCache.get(g);
    if (!re) {
      re = globToRegExp(g);
      reCache.set(g, re);
    }
    return re.test(file);
  });
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One `--grep` regex over the full Playwright title (which starts with the spec path): `@smoke` plus these specs. */
export function grepFor(specs: string[]): string {
  if (specs.length === 0) return '@smoke';
  return `@smoke|(^| )(${[...specs].sort().map(escapeRe).join('|')})( |$)`;
}

const stemOf = (file: string): string => {
  const base = posix.basename(file);
  const dot = base.indexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
};
const specStem = (spec: string): string => posix.basename(spec).replace(SPEC_RE, '');

/** Specs named `<stem>.spec.ts` or `<stem>-*.spec.ts`, anywhere under tests/e2e. */
function stemSpecs(stem: string, allSpecs: string[]): string[] {
  return allSpecs.filter((s) => {
    const b = specStem(s);
    return b === stem || b.startsWith(`${stem}-`);
  });
}

export function costOf(spec: string, durations: Durations, opts: SelectOpts): { sec: number; tests: number } {
  const d = durations.specs[spec];
  if (d) return { sec: d.sec, tests: d.tests };
  const n = opts.testsIn(spec);
  return n > 0 ? { sec: UNKNOWN_SEC_PER_TEST * n, tests: n } : { sec: UNKNOWN_SEC, tests: 1 };
}

/** True when a changed file can affect e2e: not noE2e, or noE2e but also reached by an area glob (png-lite.ts). */
export function isE2eRelevant(file: string, rules: Rules): boolean {
  return !matches(rules.noE2e, file) || matches(rules.areas.flatMap((a) => a.globs), file);
}

export function selectSpecs(changed: string[], rules: Rules, durations: Durations, allSpecs: string[], opts: SelectOpts): Selection {
  const known = new Set(allSpecs);
  const prio = new Map<string, number>();
  const reasons: Record<string, string> = {};
  const removed: string[] = [];
  let broad = false;
  let relevant = false;
  const add = (spec: string, p: number, why: string): void => {
    if (!known.has(spec)) return;
    const cur = prio.get(spec);
    if (cur === undefined || p < cur) {
      prio.set(spec, p);
      reasons[spec] = why;
    }
  };

  for (const file of [...changed].sort()) {
    // An area glob wins over noE2e (tools/assets/png-lite.ts is noE2e by directory but a spec imports it).
    if (!isE2eRelevant(file, rules)) continue;
    relevant = true;
    if (file.startsWith(E2E_DIR)) {
      const rel = file.slice(E2E_DIR.length);
      if (SPEC_RE.test(rel)) {
        if (known.has(rel)) add(rel, 0, 'changed');
        else removed.push(rel);
        continue;
      }
      const imp = opts.importers(rel);
      if (imp.length === 0 || imp.length > MAX_IMPORTERS) broad = true;
      else for (const s of imp) add(s, 0, `imports ${rel}`);
      continue;
    }
    if (matches(rules.infra, file)) broad = true;
    const isSrc = file.startsWith('src/');
    const stem = isSrc ? stemSpecs(stemOf(file), allSpecs) : [];
    let found = 0;
    for (const s of stem) add(s, 1, `stem ${stemOf(file)}`);
    found += stem.length;
    for (const a of rules.areas) {
      if (!matches(a.globs, file)) continue;
      if (a.narrow === 'stem' && stem.length > 0) continue;
      for (const s of a.specs) add(s, 2, `area ${a.area}`);
      found += a.specs.filter((s) => known.has(s)).length;
    }
    if (isSrc && found === 0) broad = true;
    // Any other path selects @smoke only (always included below).
  }

  if (!relevant) {
    return { specs: [], deferred: [], removed, reasons: {}, broad: false, noE2e: true, estSec: 0, estTests: 0 };
  }

  if (broad) {
    for (const s of rules.broadAlways) add(s, 3, 'broad');
    const byCheap = (x: { spec: string; sec: number }, y: { spec: string; sec: number }): number => x.sec - y.sec || (x.spec < y.spec ? -1 : 1);
    const cheapest: { spec: string; sec: number }[] = [];
    for (const a of rules.areas) {
      const cands = a.specs.filter((s) => known.has(s)).map((spec) => ({ spec, sec: costOf(spec, durations, opts).sec }));
      if (cands.length > 0) cheapest.push([...cands].sort(byCheap)[0] as { spec: string; sec: number });
    }
    cheapest.sort(byCheap);
    let spent = rules.broadAlways.filter((s) => known.has(s)).reduce((n, s) => n + costOf(s, durations, opts).sec, 0);
    for (const c of cheapest) {
      if (prio.has(c.spec) || spent + c.sec > rules.broadCapSec) continue;
      spent += c.sec;
      add(c.spec, 3, 'broad');
    }
  }

  let estSec = durations.smoke.sec;
  let estTests = durations.smoke.tests;
  const specs: string[] = [];
  const deferred: string[] = [];
  const byCost = (a: string, b: string): number => costOf(a, durations, opts).sec - costOf(b, durations, opts).sec || (a < b ? -1 : 1);
  for (let p = 0; p <= 3; p++) {
    const group = [...prio.entries()].filter(([, q]) => q === p).map(([s]) => s).sort(byCost);
    for (const s of group) {
      const c = costOf(s, durations, opts);
      if (p === 0 || (estSec + c.sec <= opts.budgetSec && estTests + c.tests <= opts.maxTests)) {
        specs.push(s);
        estSec += c.sec;
        estTests += c.tests;
      } else {
        deferred.push(s);
        reasons[s] = `${reasons[s] as string}; deferred to nightly (budget)`;
      }
    }
  }
  return { specs: specs.sort(), deferred: deferred.sort(), removed, reasons, broad, noE2e: false, estSec, estTests };
}

/** Specs that no rule reaches: not in any area row or broadAlways, and no `src` file stem selects them. */
export function orphanSpecs(allSpecs: string[], rules: Rules, srcFiles: string[]): string[] {
  const reached = new Set<string>(rules.broadAlways);
  for (const a of rules.areas) for (const s of a.specs) reached.add(s);
  for (const f of srcFiles) for (const s of stemSpecs(stemOf(f), allSpecs)) reached.add(s);
  return allSpecs.filter((s) => !reached.has(s)).sort();
}

// ---- file helpers (I/O) ----

export const rulesPath = 'tools/ci/touched-specs.json';
export const durationsPath = 'tools/ci/e2e-durations.json';

export const loadRules = (root = '.'): Rules => JSON.parse(readFileSync(join(root, rulesPath), 'utf8')) as Rules;
export const loadDurations = (root = '.'): Durations => JSON.parse(readFileSync(join(root, durationsPath), 'utf8')) as Durations;

function walkFiles(base: string, test: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const e of readdirSync(join(base, dir), { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(dir, e.name), rel);
      else if (test(e.name)) out.push(rel);
    }
  };
  walk('', '');
  return out.sort();
}

/** Every `*.spec.ts` under tests/e2e as ids relative to it (forward slashes), sorted. */
export const listSpecs = (root = '.'): string[] => walkFiles(join(root, 'tests/e2e'), (n) => SPEC_RE.test(n));

/** Every tracked-or-not `.ts` file under src, relative to the root. */
export const listSrc = (root = '.'): string[] => walkFiles(join(root, 'src'), (n) => /\.(ts|css)$/.test(n)).map((f) => `src/${f}`);

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

/** Static relative-import scan of tests/e2e: `importers(file)` returns the specs that reach `file`, transitively. */
export function buildImporters(root = '.'): (file: string) => string[] {
  const base = join(root, 'tests/e2e');
  const files = walkFiles(base, (n) => /\.[cm]?tsx?$/.test(n));
  const fileSet = new Set(files);
  const reverse = new Map<string, Set<string>>();
  for (const f of files) {
    const src = readFileSync(join(base, f), 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const target = posix.normalize(posix.join(posix.dirname(f), m[1] as string));
      const hit = [target, `${target}.ts`, `${target}/index.ts`].find((c) => fileSet.has(c));
      if (!hit) continue;
      if (!reverse.has(hit)) reverse.set(hit, new Set());
      (reverse.get(hit) as Set<string>).add(f);
    }
  }
  return (file) => {
    const seen = new Set<string>();
    const queue = [file];
    while (queue.length) {
      for (const p of reverse.get(queue.pop() as string) ?? []) {
        if (!seen.has(p)) {
          seen.add(p);
          queue.push(p);
        }
      }
    }
    return [...seen].filter((f) => SPEC_RE.test(f)).sort();
  };
}

export function buildTestsIn(root = '.'): (spec: string) => number {
  return (spec) => {
    const p = join(root, 'tests/e2e', spec);
    if (!existsSync(p)) return 0;
    return [...readFileSync(p, 'utf8').matchAll(/^\s*test\(/gm)].length;
  };
}

const git = (args: string[]): string => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const gitOk = (args: string[]): string | undefined => {
  try {
    return git(args);
  } catch {
    return undefined;
  }
};

/** Union of committed-since-base, staged/unstaged and untracked files (renames as delete plus add). */
export function changedFiles(base?: string): string[] {
  const branch = gitOk(['branch', '--show-current']);
  const ref = base ?? (branch === 'main' && gitOk(['rev-parse', '--verify', 'origin/main']) ? 'origin/main' : 'main');
  const mb = gitOk(['merge-base', 'HEAD', ref]) ?? ref;
  const lines = [
    ...git(['diff', '--no-renames', '--name-only', `${mb}...HEAD`]).split('\n'),
    ...git(['diff', '--no-renames', '--name-only', 'HEAD']).split('\n'),
    ...git(['ls-files', '--others', '--exclude-standard']).split('\n'),
  ];
  return [...new Set(lines.filter(Boolean))].sort();
}

function main(argv: string[]): number {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const val = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const rules = loadRules();
  const durations = loadDurations();
  const allSpecs = listSpecs();
  const budgetSec = Number(val('--budget') ?? rules.budgetSec);
  const maxTests = Number(val('--max-tests') ?? rules.maxTests);
  const changed = changedFiles(val('--base'));
  const sel = selectSpecs(changed, rules, durations, allSpecs, { budgetSec, maxTests, importers: buildImporters(), testsIn: buildTestsIn() });
  const regex = grepFor(sel.noE2e ? [] : sel.specs);
  if (args.includes('--json')) {
    console.log(JSON.stringify({ changed, ...sel, grep: sel.noE2e ? null : regex }, null, 2));
    return 0;
  }
  console.log(`changed files: ${changed.length}`);
  if (sel.noE2e) {
    console.log('no e2e-relevant change: nothing to run');
    return 0;
  }
  console.log(`selection${sel.broad ? ' (broad)' : ''}: @smoke + ${sel.specs.length} specs, ${sel.estTests} tests, est ${sel.estSec} s (budget ${budgetSec} s, max ${maxTests} tests)`);
  for (const s of sel.specs) console.log(`  ${s}  [${sel.reasons[s] as string}]`);
  if (sel.deferred.length) {
    console.log('deferred:');
    for (const s of sel.deferred) console.log(`  ${s}  [${sel.reasons[s] as string}]`);
  }
  if (sel.removed.length) console.log(`removed specs: ${sel.removed.join(', ')}`);
  console.log(`--grep ${regex}`);
  return 0;
}

if (process.argv[1]?.endsWith('touched-specs.ts')) process.exit(main(process.argv.slice(2)));
