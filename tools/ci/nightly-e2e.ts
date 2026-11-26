/**
 * Nightly full e2e on the GPU PC, in two phases so a sleeping Mac cannot lose a run:
 *   submit   fetch origin (so the bundle base is current), check out the tip of LOCAL main (pushed or not: the router bundles unpushed commits), in a detached worktree (.scratch/nightly-wt) and queue the full suite on the PC via the
 *            router (`--pc-detach`); records `pending` with the raw job id.
 *   collect  follow the pending job (`--pc-attach`), read its results.json and record pass | red | not-run.
 *   status   print the recorded status (exit 0 always: stale or not-run only warns).
 * Status: `<git common dir>/tte-gate/nightly-status.json` (+ nightly-history.jsonl). The PC is never bypassed: no Mac fallback.
 * After queuing, submit also runs `gate:commit` on that tip (nightly-precheck.ts; result in tte-gate/nightly-precheck.json, shown by status; never affects the exit code).
 * launchd runs submit at 23:00 and collect at 02:00 (tools/ci/nightly-install.ts). Pure logic: nightly-status.ts.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadKnownRed } from './known-red';
import { readPushStatus } from './nightly-push';
import { describePrecheck, makePrecheck, PRECHECK_TIMEOUT_MS, readPrecheck, writePrecheck } from './nightly-precheck';
import { noPushEnv } from './nightly-fix-logic';
import { morningReport, type FixStatus } from './nightly-fix-logic';
import { appendHistory, describeStatus, finishStatus, notRunStatus, parseRawId, parseResults, pendingStatus, prevTotalFromHistory, validateStatus, type NightlyStatus } from './nightly-status';

type Env = Readonly<Record<string, string | undefined>>;
export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
export interface Deps {
  env: Env;
  /** The checkout that holds this script (cwd for git, where the worktree is made). */
  repo: string;
  /** Directory holding nightly-status.json (the shared tte-gate dir). */
  statusDir: string;
  now: () => Date;
  run: (cmd: string, args: readonly string[], cwd: string, env: Env, timeoutMs?: number) => RunResult;
  out: (s: string) => void;
  err: (s: string) => void;
}

export const WT_REL = join('.scratch', 'nightly-wt');
const BLOCKING_ENV = ['CI', 'TTE_E2E_LOCAL', 'TTE_ALLOW_MAC_E2E'];

export const statusPath = (dir: string): string => join(dir, 'nightly-status.json');
export const historyPath = (dir: string): string => join(dir, 'nightly-history.jsonl');

export function readStatus(dir: string): NightlyStatus | undefined {
  try {
    return validateStatus(JSON.parse(readFileSync(statusPath(dir), 'utf8')) as unknown);
  } catch {
    return undefined;
  }
}

function writeStatus(dir: string, s: NightlyStatus): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(statusPath(dir), `${JSON.stringify(s, null, 2)}\n`);
  const hp = historyPath(dir);
  const old = existsSync(hp) ? readFileSync(hp, 'utf8').split('\n').filter(Boolean) : [];
  writeFileSync(hp, `${appendHistory(old, s).join('\n')}\n`);
}

const router = (repo: string): string => join(repo, 'tools/ci/e2e-route.ts');
const routerCmd = (d: Deps, wt: string, args: string[], env: Record<string, string>): RunResult =>
  d.run('corepack', ['pnpm', 'exec', 'tsx', router(d.repo), 'run', ...args], wt, { ...d.env, TTE_E2E_VIA_QUEUE: '1', ...env });

function ranOnLine(text: string): string {
  const lines = text.split('\n').filter((l) => l.startsWith('e2e ran on:'));
  return (lines[lines.length - 1] ?? '').slice('e2e ran on:'.length).trim();
}

export function submit(d: Deps): number {
  for (const k of BLOCKING_ENV) {
    if (d.env[k]) {
      d.err(`nightly: refusing to run with ${k} set (the nightly is PC only)\n`);
      return 2;
    }
  }
  const started = d.now().toISOString();
  const git = (...a: string[]): RunResult => d.run('git', a, d.repo, d.env);
  const fail = (sha: string, exit: number | null, reason: string): number => {
    writeStatus(d.statusDir, notRunStatus(sha, started, d.now().toISOString(), exit, reason));
    d.err(`nightly: not-run (${reason})\n`);
    return 0;
  };
  const f = git('fetch', 'origin', 'main');
  if (f.code !== 0) return fail('', f.code, 'git fetch failed');
  const sha = git('rev-parse', 'main').stdout.trim();
  const wt = resolve(d.repo, WT_REL);
  const prep = existsSync(wt)
    ? d.run('git', ['checkout', '--detach', '--force', sha], wt, d.env)
    : git('worktree', 'add', '--detach', wt, sha);
  if (prep.code !== 0) return fail(sha, prep.code, 'could not prepare the nightly worktree');
  const r = routerCmd(d, wt, ['--full', '--pc-detach'], {});
  const rawId = parseRawId(`${r.stdout}\n${r.stderr}`);
  if (r.code !== 0 || !rawId) return fail(sha, r.code === 0 ? null : r.code, rawId ? 'submit failed' : 'no job id from the router');
  writeStatus(d.statusDir, pendingStatus(sha, rawId, started));
  d.out(`nightly: submitted ${rawId} for ${sha.slice(0, 7)}\n`);
  precheck(d, wt, sha);
  return 0;
}

/** After the e2e is queued: gate:commit on the checked-out tip (no credentials, pushes disabled); the result goes to nightly-precheck.json. Never throws, never changes the submit exit code. */
export function precheck(d: Deps, wt: string, sha: string): void {
  try {
    const env = noPushEnv(d.env);
    const inst = d.run('corepack', ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'], wt, env, PRECHECK_TIMEOUT_MS);
    const g = inst.code === 0 ? d.run('corepack', ['pnpm', 'gate:commit'], wt, env, PRECHECK_TIMEOUT_MS) : inst;
    const s = makePrecheck(sha, g.code === 0, d.now().toISOString(), g);
    writePrecheck(d.statusDir, s);
    for (const l of describePrecheck(s).slice(0, 1)) d.out(`nightly: ${l}\n`);
  } catch (e) {
    d.err(`nightly: precheck gate:commit not recorded (${e instanceof Error ? e.message : String(e)})\n`);
  }
}

export function collect(d: Deps): number {
  const prev = readStatus(d.statusDir);
  if (!prev || prev.state !== 'pending') {
    d.out(`nightly: nothing to collect (${prev ? prev.state : 'no status'})\n`);
    return 0;
  }
  const wt = resolve(d.repo, WT_REL);
  const jsonOut = join(d.statusDir, 'nightly-results.json');
  rmSync(jsonOut, { force: true });
  const r = routerCmd(d, existsSync(wt) ? wt : d.repo, ['--pc-attach', prev.rawId], { PLAYWRIGHT_JSON_OUTPUT_FILE: jsonOut });
  let results;
  if (existsSync(jsonOut)) {
    try {
      results = parseResults(JSON.parse(readFileSync(jsonOut, 'utf8')) as unknown);
    } catch {
      results = undefined;
    }
  }
  const hp = historyPath(d.statusDir);
  const hist = existsSync(hp) ? readFileSync(hp, 'utf8').split('\n').filter(Boolean) : [];
  const next = finishStatus(prev, r.code, results, loadKnownRed(d.repo), d.now().toISOString(), ranOnLine(`${r.stdout}\n${r.stderr}`), prevTotalFromHistory(hist));
  writeStatus(d.statusDir, next);
  for (const l of describeStatus(next, d.now().getTime())) d.out(`${l}\n`);
  return 0;
}

export function status(d: Deps): number {
  let fx: FixStatus | undefined;
  try {
    const v = JSON.parse(readFileSync(join(d.statusDir, 'nightly-fix-status.json'), 'utf8')) as FixStatus;
    fx = v.schema === 1 ? v : undefined;
  } catch {
    /* no fix report yet */
  }
  // The same one-screen text as nightly-morning-report.md.
  for (const l of morningReport({ status: readStatus(d.statusDir), fix: fx, push: readPushStatus(d.statusDir), nowMs: d.now().getTime() })) d.out(`${l}\n`);
  for (const l of describePrecheck(readPrecheck(d.statusDir))) d.out(`${l}\n`);
  return 0;
}

export function main(argv: readonly string[], d: Deps): number {
  const cmd = argv.filter((a) => a !== '--')[0];
  if (cmd === 'submit') return submit(d);
  if (cmd === 'collect') return collect(d);
  if (cmd === 'status') return status(d);
  d.err('usage: nightly-e2e.ts <submit|collect|status>\n');
  return 2;
}

function realDeps(): Deps {
  const repo = resolve(import.meta.dirname, '../..');
  const run = (cmd: string, args: readonly string[], cwd: string, env: Env, timeoutMs?: number): RunResult => {
    const r = spawnSync(cmd, [...args], { cwd, env: env as NodeJS.ProcessEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...(timeoutMs ? { timeout: timeoutMs, killSignal: 'SIGKILL' as const } : {}) });
    return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
  const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], repo, process.env).stdout.trim();
  return {
    env: process.env,
    repo,
    statusDir: join(common, 'tte-gate'),
    now: () => new Date(),
    run,
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
  };
}

if (process.argv[1]?.endsWith('nightly-e2e.ts')) {
  const d = realDeps();
  const log = join(d.statusDir, 'nightly.log');
  mkdirSync(d.statusDir, { recursive: true });
  const tee = (w: (s: string) => void) => (s: string): void => {
    w(s);
    appendFileSync(log, s);
  };
  process.exit(main(process.argv.slice(2), { ...d, out: tee(d.out), err: tee(d.err) }));
}
