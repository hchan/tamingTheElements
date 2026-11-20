/**
 * Tiered gate. `gate:commit` (T1) runs the local gate steps and stamps the tree it ran on; `gate:push` (T2) reuses that
 * stamp, then runs @smoke plus the touched specs through the e2e router and records the result. Stamps live in
 * `<git common dir>/tte-gate/` (shared by every worktree) and are keyed by tree id, so a stamp is convenience evidence,
 * not proof. Pure helpers are exported for tests/repo/gate.test.ts; the I/O sits below them.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lintPlan } from './lint-targets';
import { remoteAlias } from './redact';
import {
  buildImporters,
  buildTestsIn,
  changedFiles,
  grepFor,
  isE2eRelevant,
  listSpecs,
  loadDurations,
  loadRules,
  selectSpecs,
  type Rules,
  type Selection,
} from './touched-specs';

type Env = Readonly<Record<string, string | undefined>>;

export const T1_STEPS = ['lint', 'typecheck', 'depcruise', 'test', 'test:dom', 'test:legacy', 'build', 'size:check'] as const;
export const NEUTRAL = ['tools/ci/long-gate-status.json', 'tools/ci/e2e-durations.json', 'ideas/brainstorm/long-gate-*.md', '.claude/agent-memory'];
const KEEP = 200;
const WARN_SEC = 300;
const HOOK_MAX_MEDIAN_SEC = 600;

export class UsageError extends Error {}

export interface Args {
  kind: 'commit' | 'push';
  keepGoing: boolean;
  full: boolean;
  fromPush: boolean;
  force: boolean;
  hook: boolean;
  json: boolean;
  noStamp: boolean;
  base?: string;
  budget?: number;
  maxTests?: number;
  dryRun: boolean;
  verify: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  const rest = argv.filter((a) => a !== '--');
  const kind = rest[0];
  if (kind !== 'commit' && kind !== 'push') throw new UsageError('usage: gate.ts <commit|push> [flags]');
  const a: Args = { kind, keepGoing: false, full: false, fromPush: false, force: false, hook: false, json: false, noStamp: false, dryRun: false, verify: false };
  const num = (flag: string, v: string | undefined): number => {
    const n = Number(v);
    if (v === undefined || !Number.isFinite(n) || n <= 0) throw new UsageError(`${flag} needs a positive number`);
    return n;
  };
  for (let i = 1; i < rest.length; i++) {
    const f = rest[i] as string;
    const only = (k: 'commit' | 'push'): void => {
      if (kind !== k) throw new UsageError(`${f} is only valid for ${k}`);
    };
    if (f === '--keep-going') a.keepGoing = true;
    else if (f === '--full') a.full = true;
    else if (f === '--no-stamp') a.noStamp = true;
    else if (f === '--force') {
      only('commit');
      a.force = true;
    } else if (f === '--hook') {
      only('commit');
      a.hook = true;
    } else if (f === '--json') {
      only('commit');
      a.json = true;
    } else if (f === '--dry-run' || f === '--explain') {
      only('push');
      a.dryRun = true;
    } else if (f === '--verify') {
      only('push');
      a.verify = true;
    } else if (f === '--base') {
      only('push');
      const v = rest[++i];
      if (!v) throw new UsageError('--base needs a ref');
      a.base = v;
    } else if (f === '--budget') {
      only('push');
      a.budget = num(f, rest[++i]);
    } else if (f === '--max-tests') {
      only('push');
      a.maxTests = num(f, rest[++i]);
    } else throw new UsageError(`unknown flag ${f}`);
  }
  return a;
}

/** Why `gate:push` must not run here, or undefined. The router alone picks the machine; the gate never forces one. */
export function refusal(env: Env, alias: string | undefined): string | undefined {
  if (env['CI']) return 'CI is set: it forces a local run; unset CI';
  if (env['TTE_E2E_LOCAL']) return 'TTE_E2E_LOCAL is set: gate:push never forces a local run; unset it';
  if (env['TTE_ALLOW_MAC_E2E']) return 'TTE_ALLOW_MAC_E2E is set: gate:push never forces the Mac; unset it';
  if (!alias) return 'no PC configured: git config tte.remote <alias> or TTE_REMOTE (docs/TESTING.md, Routing e2e to the PC)';
  return undefined;
}

export function childEnv(env: Env): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...env };
  for (const k of ['CI', 'TTE_E2E_LOCAL', 'TTE_ALLOW_MAC_E2E']) delete out[k];
  return out;
}

export function routerArgv(sel: Pick<Selection, 'specs'>): string[] {
  return ['corepack', 'pnpm', 'exec', 'tsx', 'tools/ci/e2e-route.ts', 'run', '--', '--grep', grepFor(sel.specs)];
}

export interface RanOn {
  where: 'PC' | 'Mac' | 'nowhere';
  jobId?: string;
  code: number;
  line: string;
}
export function parseRanOn(stderr: string): RanOn | undefined {
  const all = [...stderr.matchAll(/^e2e ran on: (.+) -> exit (\d+)$/gm)];
  const m = all[all.length - 1];
  if (!m) return undefined;
  const text = m[1] as string;
  const where = text.startsWith('PC') ? 'PC' : text.startsWith('Mac') ? 'Mac' : text.startsWith('nowhere') ? 'nowhere' : undefined;
  if (!where) return undefined;
  const job = /(?:queue )?job (?:raw-)?([^\s,)]+)[,)]/.exec(text)?.[1];
  return { where, ...(job ? { jobId: job } : {}), code: Number(m[2]), line: `${text} -> exit ${m[2] as string}` };
}

const NEUTRAL_RE = [/^tools\/ci\/long-gate-status\.json$/, /^tools\/ci\/e2e-durations\.json$/, /^ideas\/brainstorm\/long-gate-[^/]*\.md$/, /^\.claude\/agent-memory(\/|$)/];
export const isT1Neutral = (path: string): boolean => NEUTRAL_RE.some((r) => r.test(path));

/** Hash of the e2e-relevant blobs in `git ls-tree -r HEAD` output (docs, ideas and other non-e2e paths do not move it). */
export function e2eFingerprint(lsTree: string, rules: Rules): string {
  const rows: string[] = [];
  for (const line of lsTree.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const path = line.slice(tab + 1);
    if (isE2eRelevant(path, rules)) rows.push(`${line.slice(0, tab).split(' ')[2] as string} ${path}`);
  }
  return createHash('sha1').update(rows.sort().join('\n')).digest('hex');
}

export function pushVerify(o: { changed: string[]; rules: Rules; stampPass: boolean; fp: string; base: string }): { ok: boolean; message?: string } {
  const rel = o.changed.filter((f) => isE2eRelevant(f, o.rules));
  if (rel.length === 0 || o.stampPass) return { ok: true };
  return {
    ok: false,
    message: `push blocked: no passing gate:push for ${o.fp.slice(0, 7)} (${rel.length} e2e-relevant files changed since ${o.base.slice(0, 7)}). Run: corepack pnpm gate:push (15-30 min; Bash run_in_background), then push again.`,
  };
}

/** The hook may run T1 itself unless the median of the last three stamps (newest first) is over 10 minutes. */
export function hookMayRunT1(stamps: readonly { totalSec: number }[]): boolean {
  if (stamps.length < 3) return true;
  const last = stamps.slice(0, 3).map((s) => s.totalSec).sort((x, y) => x - y);
  return (last[1] as number) <= HOOK_MAX_MEDIAN_SEC;
}

/** Names to delete so only the newest `keep` remain; `names` are sorted newest first by the caller. */
export function pruneList(names: readonly string[], keep = KEEP): string[] {
  return names.slice(keep);
}

export function summaryLine(o: { pass: boolean; specs: number; tests: number; estSec: number; ranOn?: string }): string {
  return `gate:push: ${o.pass ? 'pass' : 'fail'} (${o.specs} specs, ${o.tests} tests, est ${o.estSec} s; e2e ran on: ${o.ranOn ?? 'unknown'})`;
}

// ---- I/O ----

const git = (cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env): string => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`);
  return r.stdout;
};
const gitOk = (cwd: string, args: string[]): string | undefined => {
  try {
    return git(cwd, args).trim();
  } catch {
    return undefined;
  }
};

export function stampDir(cwd: string): string {
  const dir = join(git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim(), 'tte-gate');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** Tree id with the T1-neutral paths removed. Works on a temp copy of the index so the real one is never touched. */
export function treeKey(cwd: string, mode: 'worktree' | 'head'): string {
  const top = git(cwd, ['rev-parse', '--show-toplevel']).trim();
  const tmp = join(stampDir(cwd), `index-${process.pid}-${mode}`);
  const env = { ...process.env, GIT_INDEX_FILE: tmp };
  try {
    if (mode === 'worktree') {
      const real = resolve(top, git(top, ['rev-parse', '--git-path', 'index']).trim());
      if (existsSync(real)) copyFileSync(real, tmp);
      git(top, ['add', '-A'], env);
    } else git(top, ['read-tree', 'HEAD'], env);
    git(top, ['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...NEUTRAL], env);
    return git(top, ['write-tree'], env).trim();
  } finally {
    rmSync(tmp, { force: true });
  }
}

export function dirtyPaths(cwd: string): string[] {
  const out = [
    ...git(cwd, ['diff', '--no-renames', '--name-only', 'HEAD']).split('\n'),
    ...git(cwd, ['ls-files', '--others', '--exclude-standard']).split('\n'),
  ];
  return [...new Set(out.filter(Boolean))].sort();
}

export interface Stamp {
  schema: 1;
  [k: string]: unknown;
}
export function readStamp(cwd: string, name: string): Stamp | undefined {
  const p = join(stampDir(cwd), name);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Stamp;
  } catch {
    return undefined;
  }
}
const newestFirst = (dir: string, kind: string): string[] =>
  readdirSync(dir)
    .filter((n) => n.startsWith(`${kind}-`) && n.endsWith('.json'))
    .map((n) => ({ n, t: statSync(join(dir, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .map((x) => x.n);
export function writeStamp(cwd: string, name: string, data: Stamp): void {
  const dir = stampDir(cwd);
  const tmp = join(dir, `${name}.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, join(dir, name));
  for (const n of pruneList(newestFirst(dir, name.split('-')[0] as string))) unlinkSync(join(dir, n));
}
const recentCommitStamps = (cwd: string): { totalSec: number }[] => {
  const dir = stampDir(cwd);
  return newestFirst(dir, 'commit')
    .slice(0, 3)
    .map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8')) as { totalSec: number });
};

const runStep = (cwd: string, step: string, quiet: boolean): { code: number; sec: number; tail: string } => {
  const t0 = Date.now();
  const r = spawnSync('corepack', ['pnpm', 'run', step], { cwd, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit', maxBuffer: 1 << 28 });
  const tail = quiet ? `${r.stdout}${r.stderr}`.trim().split('\n').slice(-30).join('\n') : '';
  return { code: r.status ?? 1, sec: Math.round((Date.now() - t0) / 100) / 10, tail };
};

export interface StepResult {
  code: number;
  sec: number;
  tail: string;
  out: string;
}
const PNPM_RUN = ['corepack', 'pnpm', 'run'];
const CONCURRENT = ['lint', 'test'] as const;

/** Async step runner: output is buffered (so concurrent steps never interleave). */
export function runStepAsync(cwd: string, step: string, run: readonly string[] = PNPM_RUN, argv?: readonly string[]): { done: Promise<StepResult>; kill: () => void } {
  const t0 = Date.now();
  const cmd = argv ?? [...run, step];
  const child = spawn(cmd[0] as string, cmd.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const chunks: Buffer[] = [];
  child.stdout.on('data', (d: Buffer) => chunks.push(d));
  child.stderr.on('data', (d: Buffer) => chunks.push(d));
  let killed = false;
  const kill = (): void => {
    killed = true;
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  };
  const done = new Promise<StepResult>((resolveDone) => {
    const fin = (code: number | null): void => {
      const out = Buffer.concat(chunks).toString('utf8');
      const tail = out.trim().split('\n').slice(-30).join('\n');
      resolveDone({ code: killed ? 143 : (code ?? 1), sec: Math.round((Date.now() - t0) / 100) / 10, tail, out });
    };
    child.on('error', () => fin(1));
    child.on('close', fin);
  });
  return { done, kill };
}

/**
 * Runs steps concurrently and calls `emit` with each step's buffered output in the given order.
 * Fail-fast (kills the others on the first failure) unless keepGoing; killed steps are reported with code 143.
 */
export async function runConcurrent(
  cwd: string,
  steps: readonly string[],
  keepGoing: boolean,
  emit: (step: string, r: StepResult) => void,
  run: readonly string[] = PNPM_RUN,
  overrides: Readonly<Record<string, readonly string[]>> = {},
): Promise<{ name: string; sec: number; code: number; tail: string }[]> {
  const jobs = steps.map((s) => runStepAsync(cwd, s, run, overrides[s]));
  let failFast = false;
  const settled = jobs.map((j) =>
    j.done.then((r) => {
      if (r.code !== 0 && !keepGoing && !failFast) {
        failFast = true;
        for (const o of jobs) if (o !== j) o.kill();
      }
      return r;
    }),
  );
  const out: { name: string; sec: number; code: number; tail: string }[] = [];
  for (const [i, p] of settled.entries()) {
    const r = await p;
    const name = steps[i] as string;
    emit(name, r);
    out.push({ name, sec: r.sec, code: r.code, tail: r.tail });
  }
  return out;
}

/** Files changed vs the merge-base with main plus dirty/untracked ones; undefined when git cannot tell (full lint). */
function changedForLint(cwd: string): string[] | undefined {
  try {
    const base = git(cwd, ['merge-base', 'HEAD', 'main']).trim();
    const out = [...git(cwd, ['diff', '--no-renames', '--name-only', base]).split('\n'), ...git(cwd, ['ls-files', '--others', '--exclude-standard']).split('\n')];
    return out.filter(Boolean);
  } catch {
    return undefined;
  }
}

/** `gate:commit` lints only changed files (a command override); an empty override keeps the full `pnpm run lint`. */
function lintOverride(a: Args, cwd: string, log: (s: string) => void): Record<string, readonly string[]> {
  if (a.full || a.fromPush) return {};
  const top = gitOk(cwd, ['rev-parse', '--show-toplevel']) ?? cwd;
  const files = lintPlan(changedForLint(cwd), (p) => existsSync(join(top, p)));
  if (!files) {
    log('gate:commit: lint all (config change or no diff base)');
    return {};
  }
  log(`gate:commit: lint ${files.length} changed files (--full lints all)`);
  if (files.length === 0) return { lint: ['node', '-e', '0'] };
  return { lint: [...PNPM_RUN.slice(0, 2), 'exec', 'eslint', '--cache', '--cache-strategy', 'content', '--cache-location', '.scratch/eslintcache', ...files] };
}

async function runCommit(a: Args, cwd: string): Promise<number> {
  const log = (s: string): void => {
    if (!a.json) console.log(s);
  };
  const mode = a.hook ? 'head' : 'worktree';
  const key0 = treeKey(cwd, mode);
  const name = `commit-${key0}.json`;
  if (!a.force && readStamp(cwd, name)) {
    log(`gate:commit: stamp hit for tree ${key0.slice(0, 7)} (skipped; --force reruns)`);
    return 0;
  }
  const dirty = dirtyPaths(cwd).filter((p) => !isT1Neutral(p));
  if (a.hook) {
    if (dirty.length > 0) {
      console.error(`no gate:commit stamp for HEAD and the tree is dirty (${dirty.slice(0, 5).join(', ')}); commit or stash these first`);
      return 2;
    }
    if (!hookMayRunT1(recentCommitStamps(cwd))) {
      console.error('no gate:commit stamp for HEAD: run corepack pnpm gate:commit first');
      return 2;
    }
  }
  const results: { name: string; sec: number; code: number }[] = [];
  let failedTail = '';
  const wall0 = Date.now();
  log(`gate:commit: ${CONCURRENT.join(' + ')} (concurrent) ...`);
  const pair = await runConcurrent(cwd, CONCURRENT, a.keepGoing, (step, r) => {
    if (!a.hook && !a.json) process.stdout.write(`--- ${step} ---\n${r.out}`);
  }, PNPM_RUN, a.hook ? {} : lintOverride(a, cwd, log));
  const pairFail = pair.find((r) => r.code !== 0 && r.code !== 143) ?? pair.find((r) => r.code !== 0);
  // a step killed by fail-fast is not a result of its own
  for (const r of pair) if (!(r.code === 143 && pairFail && pairFail !== r)) results.push({ name: r.name, sec: r.sec, code: r.code });
  if (pairFail) failedTail = pairFail.tail;
  if (!pairFail || a.keepGoing) {
    for (const s of T1_STEPS) {
      if ((CONCURRENT as readonly string[]).includes(s)) continue;
      log(`gate:commit: ${s} ...`);
      const r = runStep(cwd, s, a.hook);
      results.push({ name: s, sec: r.sec, code: r.code });
      if (r.code !== 0) {
        if (!failedTail) failedTail = r.tail;
        if (!a.keepGoing) break;
      }
    }
  }
  results.sort((x, y) => (T1_STEPS as readonly string[]).indexOf(x.name) - (T1_STEPS as readonly string[]).indexOf(y.name));
  const failed = results.filter((r) => r.code !== 0);
  const totalSec = Math.round((Date.now() - wall0) / 1000);
  if (a.json) console.log(JSON.stringify({ pass: failed.length === 0, totalSec, steps: results, key: key0 }, null, 2));
  else {
    for (const r of results) console.log(`  ${r.code === 0 ? 'ok  ' : 'FAIL'} ${r.name.padEnd(12)} ${r.sec} s`);
    console.log(`gate:commit: ${failed.length ? 'FAIL' : 'pass'} in ${totalSec} s`);
    if (totalSec > WARN_SEC) console.log(`gate:commit: warning, over ${WARN_SEC} s total; look for a step to speed up`);
    if (dirty.length) console.log(`gate:commit: dirty tree (${dirty.length} paths): ${dirty.slice(0, 10).join(', ')}${dirty.length > 10 ? ', ...' : ''}`);
  }
  if (failed.length) {
    if (a.hook && failedTail) console.error(`${(failed[0] as { name: string }).name} failed, last lines:\n${failedTail}`);
    return a.hook ? 2 : 1;
  }
  if (a.noStamp) return 0;
  if (treeKey(cwd, mode) !== key0) {
    console.error('gate:commit: the tree changed during the run; no stamp written');
    return 0;
  }
  writeStamp(cwd, name, {
    schema: 1,
    key: key0,
    tree: key0,
    head: gitOk(cwd, ['rev-parse', 'HEAD']) ?? '',
    dirty,
    steps: results.map((r) => ({ name: r.name, sec: r.sec })),
    totalSec,
    finishedAt: new Date().toISOString(),
    node: process.version,
    pnpm: spawnSync('corepack', ['pnpm', '--version'], { cwd, encoding: 'utf8' }).stdout.trim(),
  });
  return 0;
}

const lsTreeHead = (cwd: string): string => git(cwd, ['ls-tree', '-r', 'HEAD']);

/** The router's verdict line (`VERDICT: ...`) from its output, if any. */
export function verdictLine(output: string): string | undefined {
  return output.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('VERDICT:')).pop();
}

/** A router run passes on exit 0, or when the e2e reporter's verdict is PUSH OK (only P2, known or flaky reds). */
export function runPassed(code: number, output: string): boolean {
  return code === 0 || (verdictLine(output) ?? '').startsWith('VERDICT: PUSH OK');
}

function runRouter(argv: string[], env: Record<string, string | undefined>, cwd: string): Promise<{ code: number; stderr: string; stdout: string }> {
  return new Promise((done) => {
    const child = spawn(argv[0] as string, argv.slice(1), { cwd, env: env as NodeJS.ProcessEnv, stdio: ['inherit', 'pipe', 'pipe'] });
    let tail = '';
    let outTail = '';
    child.stdout.on('data', (d: Buffer) => {
      process.stdout.write(d);
      outTail = (outTail + d.toString()).slice(-65536);
    });
    child.stderr.on('data', (d: Buffer) => {
      process.stderr.write(d);
      tail = (tail + d.toString()).slice(-65536);
    });
    const hi = (): void => void child.kill('SIGINT');
    const ht = (): void => void child.kill('SIGTERM');
    process.on('SIGINT', hi);
    process.on('SIGTERM', ht);
    child.on('close', (code, sig) => {
      process.off('SIGINT', hi);
      process.off('SIGTERM', ht);
      done({ code: code ?? (sig === 'SIGINT' ? 130 : 143), stderr: tail, stdout: outTail });
    });
  });
}

function baseSha(a: Args, cwd: string): string {
  const branch = gitOk(cwd, ['branch', '--show-current']);
  const ref = a.base ?? (branch === 'main' && gitOk(cwd, ['rev-parse', '--verify', 'origin/main']) ? 'origin/main' : 'main');
  return gitOk(cwd, ['merge-base', 'HEAD', ref]) ?? ref;
}

function printSelection(sel: Selection, maxTests: number): void {
  console.log(`selection${sel.broad ? ' (broad)' : ''}: @smoke + ${sel.specs.length} specs, ${sel.estTests} tests, est ${sel.estSec} s`);
  for (const s of sel.specs) console.log(`  ${s}  [${sel.reasons[s] as string}]`);
  for (const s of sel.deferred) console.log(`  deferred ${s}  [${sel.reasons[s] as string}]`);
  if (sel.removed.length) console.log(`removed specs: ${sel.removed.join(', ')}`);
  if (sel.estTests > maxTests) console.log(`warning: ${sel.estTests} tests > ${maxTests}: full lane, PC only`);
}

async function runPush(a: Args, cwd: string, env: Env): Promise<number> {
  const rules = loadRules();
  if (a.verify) {
    const base = gitOk(cwd, ['merge-base', 'HEAD', 'origin/main']);
    const changed = base
      ? git(cwd, ['diff', '--no-renames', '--name-only', base, 'HEAD']).split('\n').filter(Boolean)
      : lsTreeHead(cwd).split('\n').map((l) => l.slice(l.indexOf('\t') + 1)).filter(Boolean);
    const fp = e2eFingerprint(lsTreeHead(cwd), rules);
    const stamp = readStamp(cwd, `push-${fp}.json`);
    const v = pushVerify({ changed, rules, stampPass: stamp?.['result'] === 'pass', fp, base: base ?? 'unknown' });
    if (v.ok) console.log('gate:push --verify: ok');
    else console.error(v.message);
    return v.ok ? 0 : 2;
  }
  const refuse = refusal(env, remoteAlias(env, cwd));
  if (refuse && !a.dryRun) {
    console.error(`gate:push: ${refuse}`);
    return 2;
  }
  const maxTests = a.maxTests ?? rules.maxTests;
  const budgetSec = a.budget ?? rules.budgetSec;
  const sel = selectSpecs(changedFiles(baseSha(a, cwd)), rules, loadDurations(), listSpecs(), {
    budgetSec,
    maxTests,
    importers: buildImporters(),
    testsIn: buildTestsIn(),
  });
  const argv = routerArgv(sel);
  if (a.dryRun) {
    const key = treeKey(cwd, 'worktree');
    console.log(`T1 stamp for tree ${key.slice(0, 7)}: ${readStamp(cwd, `commit-${key}.json`) ? 'hit' : 'miss'}`);
    if (sel.noE2e) console.log('no e2e-relevant change: nothing would run');
    else {
      printSelection(sel, maxTests);
      console.log(JSON.stringify(argv));
    }
    if (refuse) console.log(`would refuse: ${refuse}`);
    return 0;
  }
  const t1 = await runCommit({ ...a, kind: 'commit', fromPush: true, hook: false, json: false, force: false }, cwd);
  if (t1 !== 0) return t1;
  if (sel.noE2e) {
    console.log('gate:push: pass (no e2e-relevant change)');
    return 0;
  }
  printSelection(sel, maxTests);
  const fp0 = e2eFingerprint(lsTreeHead(cwd), rules);
  const clean0 = !dirtyPaths(cwd).some((p) => isE2eRelevant(p, rules));
  const res = await runRouter(argv, childEnv(env), cwd);
  const ran = parseRanOn(res.stderr);
  const pass = runPassed(res.code, `${res.stdout}\n${res.stderr}`);
  const vline = verdictLine(`${res.stdout}\n${res.stderr}`);
  const clean1 = !dirtyPaths(cwd).some((p) => isE2eRelevant(p, rules));
  const fp1 = e2eFingerprint(lsTreeHead(cwd), rules);
  let why = '';
  if (!ran) why = 'no "e2e ran on:" line';
  else if (!clean0 || !clean1) why = 'e2e-relevant files are uncommitted';
  else if (fp0 !== fp1) why = 'HEAD changed during the run';
  else if (a.noStamp) why = '--no-stamp';
  if (pass && !why && ran) {
    writeStamp(cwd, `push-${fp0}.json`, {
      schema: 1,
      fp: fp0,
      head: gitOk(cwd, ['rev-parse', 'HEAD']) ?? '',
      base: baseSha(a, cwd),
      result: 'pass',
      ranOn: ran.where,
      jobId: ran.jobId ?? null,
      selected: sel.specs,
      deferred: sel.deferred,
      budgetSec,
      estSec: sel.estSec,
      finishedAt: new Date().toISOString(),
    });
  } else if (pass) console.log(`gate:push: not stamped (${why}); evidence, not a stamp`);
  console.log(summaryLine({ pass, specs: sel.specs.length, tests: sel.estTests, estSec: sel.estSec, ...(ran ? { ranOn: ran.line } : {}) }));
  if (pass && res.code !== 0 && vline) console.log(`gate:push: router exit ${String(res.code)} accepted: ${vline}`);
  return pass ? 0 : res.code;
}

export async function main(argv: string[], env: Env = process.env, cwd = process.cwd()): Promise<number> {
  let a: Args;
  try {
    a = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(e.message);
      return 2;
    }
    throw e;
  }
  return a.kind === 'commit' ? await runCommit(a, cwd) : runPush(a, cwd, env);
}

if (process.argv[1]?.endsWith('gate.ts')) void main(process.argv.slice(2)).then((c) => process.exit(c));
