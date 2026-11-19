/**
 * The e2e router behind `pnpm e2e`, `e2e:smoke`, `e2e:pages`, `e2e:itch`, `e2e:flake`, `e2e:remote` and `e2e:local`:
 *   tsx tools/ci/e2e-route.ts <run|smoke|pages|itch|flake> [router flags] [-- playwright args]
 * With a remote configured (TTE_REMOTE, else `git config tte.remote`: an ssh alias) the PC is the first choice: a cached probe
 * (pc-probe.ts) and the pure decision function (pc-decide.ts) pick the next step in a loop: run on the PC (snapshot via
 * pc-snapshot.ts, job via pc-job.ts, upload and follow via pc-remote.ts, results copied to .scratch/remote-e2e/<id>/), wait, or
 * fall back to the Mac. Only SHORT runs (<= 150 tests incl. repeats; run/smoke/pages/itch; not --pc, --pc-detach, --full or a full
 * lane) may fall back, through the browser slot (tools/ci/browser-slot.ts) with a FALLBACK banner and a Mac load guard. Never the
 * Mac after a PC exit 0 or 1. Policy: `--pc-fallback <mac|wait|fail>` or TTE_E2E_FALLBACK (default mac; --pc/--pc-detach force fail).
 * Without a remote, or with CI or `--list`, the old local behaviour runs unchanged. `--local` and TTE_E2E_LOCAL=1 are refused while
 * a remote is configured unless TTE_ALLOW_MAC_E2E=1. Env: TTE_MAC_LOAD_MAX (14), TTE_MAC_LOAD_WAIT_SEC (900), TTE_PC_BUSY_WAIT_SEC
 * (600), TTE_PC_WAIT_MAX_SEC (1800), TTE_PC_PROBE_TTL_SEC (60). Router flags are exact tokens: --pc --local --smoke --full
 * --workers N --pc-lane <short|full> --pc-include <p> --pc-fetch <p> --pc-detach --pc-attach <id> --pc-cancel <id> --pc-jobs
 * --pc-status --pc-fallback <p>.
 * Exit codes: Playwright's 0/1, 2 usage, 3 upload, 89 no runner (PC unavailable and the Mac too loaded), 92 bundle, 93 job lost,
 * 94 PC unreachable, 95 PC busy, 96 frames, 97 PC needs setup, 124 hard timeout, 255 ssh given up. Last line on stderr (remote
 * configured): `e2e ran on: PC (job <id>, <lane> lane) -> exit N` or `e2e ran on: Mac (fallback: <reason>) -> exit N`.
 * Output is redacted (addresses, user@host, home paths). Plan: ~/claudetmp/plans/pc-first-fallback-plan.md (F3).
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join, resolve } from 'node:path';
import { decide, DEFAULT_LIMITS, macEligible, type Ask, type History, type Limits, type PcView, type Policy, type Step } from './pc-decide';
import { LANES, renderJob, type JobSpec, type LaneName } from './pc-job';
import * as pc from './pc-remote';
import { PcError, type JobStatus, type Remote } from './pc-remote';
import { cacheFile, probe as realProbe, keyOf, noteExit, readCache, writeCache } from './pc-probe';
import { logPathFor } from './e2e-server-policy';
import { redact, remoteAlias } from './redact';
import { planSource, type SourcePlan } from './pc-snapshot';
import { CtlError, queueClient, userToken, type QueueClient } from '../gpu-queue/client';

export type Kind = 'run' | 'smoke' | 'pages' | 'itch' | 'flake';
export interface Parsed {
  kind: Kind;
  mode: 'auto' | 'pc' | 'local';
  full: boolean;
  lane?: LaneName;
  workers?: number;
  include: string[];
  fetch: string[];
  detach: boolean;
  attach?: string;
  cancel?: string;
  jobs: boolean;
  status: boolean;
  fallback?: Policy;
  rest: string[];
}
export { redact, remoteAlias };
type Env = Readonly<Record<string, string | undefined>>;

const KINDS: readonly Kind[] = ['run', 'smoke', 'pages', 'itch', 'flake'];
const CONFIG: Record<'pages' | 'itch', string> = { pages: 'playwright.pages.config.ts', itch: 'playwright.itch.config.ts' };
const FLAKE_SUMMARY = '.scratch/pc-flake-summary.json';
const LANE_TEST_LIMIT = 150;

export class UsageError extends Error {}

/** Parse router flags (exact tokens); everything else, minus bare `--`, belongs to Playwright. */
export function parseArgs(argv: readonly string[]): Parsed {
  const [k, ...args] = argv;
  if (!KINDS.includes(k as Kind)) throw new UsageError(`usage: e2e-route.ts <${KINDS.join('|')}> [flags] [-- playwright args]`);
  const p: Parsed = { kind: k as Kind, mode: 'auto', full: false, include: [], fetch: [], detach: false, jobs: false, status: false, rest: [] };
  const val = (i: number, flag: string): string => {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) throw new UsageError(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '--') continue;
    else if (a === '--pc' || a === '--local') {
      const mode = a === '--pc' ? 'pc' : 'local';
      if (p.mode !== 'auto' && p.mode !== mode) throw new UsageError('--pc and --local conflict');
      p.mode = mode;
    } else if (a === '--smoke') p.kind = 'smoke';
    else if (a === '--full') p.full = true;
    else if (a === '--pc-detach') p.detach = true;
    else if (a === '--pc-jobs') p.jobs = true;
    else if (a === '--pc-status') p.status = true;
    else if (a === '--pc-lane') {
      const v = val(i++, a);
      if (v !== 'short' && v !== 'full') throw new UsageError('--pc-lane is short or full');
      p.lane = v;
    } else if (a === '--pc-include') p.include.push(val(i++, a));
    else if (a === '--pc-fetch') p.fetch.push(val(i++, a));
    else if (a === '--pc-fallback') {
      const v = val(i++, a);
      if (v !== 'mac' && v !== 'wait' && v !== 'fail') throw new UsageError('--pc-fallback is mac, wait or fail');
      p.fallback = v;
    } else if (a === '--pc-attach') p.attach = val(i++, a);
    else if (a === '--pc-cancel') p.cancel = val(i++, a);
    else if (a === '--workers' && p.kind !== 'flake') {
      const n = Number.parseInt(val(i++, a), 10);
      if (!Number.isInteger(n) || n < 1) throw new UsageError('--workers needs a positive integer');
      p.workers = n;
    } else p.rest.push(a);
  }
  return p;
}

export type Route = { where: 'local' } | { where: 'remote' } | { where: 'refuse'; why: string };
/** The route table. `alias` is the configured remote, if any. */
export function route(p: Parsed, env: Env, alias: string | undefined): Route {
  const admin = p.attach !== undefined || p.cancel !== undefined || p.jobs || p.status;
  if (admin) return alias ? { where: 'remote' } : { where: 'refuse', why: 'no PC configured (git config tte.remote <ssh alias> or TTE_REMOTE)' };
  if (env['CI'] || p.rest.includes('--list')) return { where: 'local' };
  if (p.mode === 'local' || env['TTE_E2E_LOCAL'] === '1') {
    if (alias && env['TTE_ALLOW_MAC_E2E'] !== '1') return { where: 'refuse', why: 'browser e2e runs on the GPU PC (pnpm e2e); a Mac run needs the coordinator: TTE_ALLOW_MAC_E2E=1' };
    return { where: 'local' };
  }
  if (p.mode === 'pc' && !alias) return { where: 'refuse', why: 'no PC configured (git config tte.remote <ssh alias> or TTE_REMOTE)' };
  return alias ? { where: 'remote' } : { where: 'local' };
}

/** The Playwright (or flake) argv for a kind, without the leading `playwright test`. */
function kindArgs(p: Parsed): string[] {
  if (p.kind === 'smoke') return ['--grep', '@smoke', ...p.rest];
  if (p.kind === 'pages' || p.kind === 'itch') return ['--config', CONFIG[p.kind], ...p.rest];
  return p.rest;
}

/** Strip router-irrelevant flags and ask Playwright how many tests the filters select (no browser). */
export type Counter = (args: readonly string[]) => number | undefined;
const realCount: Counter = (args) => {
  const r = spawnSync('corepack', ['pnpm', 'exec', 'playwright', 'test', '--list', '--reporter=list', ...args], { encoding: 'utf8' });
  const m = /Total: (\d+) tests?/.exec(r.stdout);
  return m ? Number(m[1]) : undefined;
};
export function repeatOf(args: readonly string[]): number {
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    const m = /^--repeat(?:-each)?=(\d+)$/.exec(a);
    const v = m ? m[1] : a === '--repeat' || a === '--repeat-each' ? args[i + 1] : undefined;
    if (v !== undefined && Number.isInteger(Number(v)) && Number(v) > 0) return Number(v);
  }
  return 1;
}
/** Drop flags (with their value) from an argv: `--name v` and `--name=v`. */
function dropFlags(args: readonly string[], names: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (names.includes(a)) i++;
    else if (!names.some((n) => a.startsWith(`${n}=`))) out.push(a);
  }
  return out;
}
/** Tests the filters select times the repeat count; undefined when Playwright cannot say. */
export function testsOf(p: Parsed, count: Counter): number | undefined {
  const base = kindArgs(p);
  const n = count(p.kind === 'flake' ? dropFlags(base, ['--repeat', '--summary-json']) : dropFlags(base, ['--repeat-each']));
  return n === undefined ? undefined : n * repeatOf(base);
}
export function pickLane(p: Parsed, count: Counter): LaneName {
  if (p.lane) return p.lane;
  if (p.full) return 'full';
  const n = testsOf(p, count);
  return n === undefined || n > LANE_TEST_LIMIT ? 'full' : 'short';
}

const TROUBLE = /EXITED|unresponsive|gave up|port in use|parent gone/;
/** The preview-server log lines (tools/ci/e2e-server.ts) from this run that say the server itself had trouble: at most 10. */
export function serverTrouble(logText: string, sinceIso: string): string[] {
  return logText
    .split('\n')
    .filter((l) => /^\d{4}-\d\d-\d\dT/.test(l) && l.slice(0, 24) >= sinceIso && TROUBLE.test(l))
    .slice(0, 10);
}

/** After a failed run: print the preview server's trouble lines, if any (redacted). `file` may not exist. */
function printServerTrouble(file: string, sinceIso: string, write: (s: string) => unknown): void {
  if (!existsSync(file)) return;
  const lines = serverTrouble(readFileSync(file, 'utf8'), sinceIso);
  if (lines.length > 0) write(redact(`preview server trouble during this run:\n${lines.map((l) => `  ${l}`).join('\n')}\n`));
}

export interface Summary {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  durationMs: number;
  failures: { file: string; line: number; title: string; error: string }[];
}
type Json = Record<string, unknown>;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
/** Summarise a Playwright JSON report. */
export function summarize(report: unknown): Summary {
  const r = (report ?? {}) as Json;
  const st = (r['stats'] ?? {}) as Record<string, number>;
  const out: Summary = { passed: st['expected'] ?? 0, failed: st['unexpected'] ?? 0, flaky: st['flaky'] ?? 0, skipped: st['skipped'] ?? 0, durationMs: Math.round(st['duration'] ?? 0), failures: [] };
  const walk = (suite: Json): void => {
    for (const spec of (suite['specs'] as Json[] | undefined) ?? []) {
      if (spec['ok'] !== false) continue;
      const tests = (spec['tests'] as Json[] | undefined) ?? [];
      const results = tests.flatMap((t) => (t['results'] as Json[] | undefined) ?? []);
      const bad = [...results].reverse().find((x) => x['error'] !== undefined) as Json | undefined;
      const msg = String(((bad?.['error'] ?? {}) as Json)['message'] ?? 'failed').replace(ANSI, '');
      const first = msg.split('\n').find((l) => l.trim() !== '') ?? 'failed';
      out.failures.push({ file: String(spec['file'] ?? '?'), line: Number(spec['line'] ?? 0), title: String(spec['title'] ?? '?'), error: first.trim() });
    }
    for (const s of (suite['suites'] as Json[] | undefined) ?? []) walk(s);
  };
  for (const s of (r['suites'] as Json[] | undefined) ?? []) walk(s);
  return out;
}
const dur = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${String(Math.floor(s / 60))}m${String(s % 60).padStart(2, '0')}s` : `${String(s)}s`;
};

export interface Deps {
  remote: Remote;
  plan: (cwd: string, id: string, o: { include: string[]; outDir: string }) => SourcePlan;
  render: (spec: JobSpec) => { jobSh: string; startSh: string };
  count: Counter;
  out: { write(c: string | Buffer): unknown };
  err: { write(c: string | Buffer): unknown };
  follow?: pc.FollowOpts;
  /** Queue client for the opt-in full-lane queue path (TTE_E2E_VIA_QUEUE=1); main builds it lazily. */
  queue?: QueueClient;
  /** Job dir cap in MB for the queue path (default 1024, the server's RAW_CAP). */
  rawCapMb?: number;
}
const defaultRemote = (alias: string, env: Env): Remote => ({ alias, distro: env['TTE_REMOTE_DISTRO'] || 'Ubuntu', ssh: env['TTE_SSH'] || 'ssh' });
export const newId = (lane: LaneName, now = new Date()): string =>
  `${now.toISOString().replace(/\.\d+Z$/, '').replace(/[-:]/g, '').replace('T', '-')}-${lane}-${randomBytes(3).toString('hex')}`;

/** Job spec for a kind; flake summaries and --pc-fetch paths come back through out/fetch. */
export function buildSpec(p: Parsed, id: string, lane: LaneName, source: SourcePlan): JobSpec {
  const base = kindArgs(p);
  const flake = p.kind === 'flake';
  const args = flake ? [...dropFlags(base, ['--summary-json']), '--summary-json', FLAKE_SUMMARY] : base;
  const spec: JobSpec = {
    id,
    lane,
    source: { sha: source.sha, ...(source.ref ? { ref: source.ref } : {}), ...(source.sha256 ? { sha256: source.sha256 } : {}) },
    command: flake ? ['corepack', 'pnpm', 'exec', 'tsx', 'tools/ci/e2e-flake.ts', ...args] : ['corepack', 'pnpm', 'exec', 'playwright', 'test', ...args],
    // Short lane: one retry so a browser close on the PC shows as "flaky" (reported, not hidden) instead of red. Flake runs stay at 0.
    env: lane === 'short' && !flake ? { TTE_E2E_RETRIES: '1' } : {},
    fetch: flake ? [...p.fetch, FLAKE_SUMMARY] : p.fetch,
    preflight: true,
    direct: !flake,
  };
  if (p.workers !== undefined) spec.workers = p.workers;
  return spec;
}

function report(id: string, sha: string, lane: LaneName, workers: number, st: JobStatus, dir: string, d: Deps, env: Env): void {
  const jsonPath = join(dir, 'results.json');
  const w = (s: string): unknown => d.out.write(redact(s));
  if (existsSync(jsonPath)) {
    const sum = summarize(JSON.parse(readFileSync(jsonPath, 'utf8')) as unknown);
    const q = st.queueSec === undefined ? '' : ` (queue ${String(st.queueSec)}s)`;
    w(`PC e2e ${id} ${sha.slice(0, 7)} ${lane} x${String(workers)}: ${String(sum.passed)} passed, ${String(sum.failed)} failed, ${String(sum.skipped)} skipped${sum.flaky ? `, ${String(sum.flaky)} flaky` : ''}, ${dur(sum.durationMs)}${q}\n`);
    for (const f of sum.failures) w(`  ${f.file}:${String(f.line)} ${f.title}: ${f.error}\n`);
    const to = env['PLAYWRIGHT_JSON_OUTPUT_FILE'];
    if (to) {
      mkdirSync(resolve(to, '..'), { recursive: true });
      copyFileSync(jsonPath, to);
    }
  } else w(`PC e2e ${id} ${sha.slice(0, 7)} ${lane} x${String(workers)}: no results.json (state ${st.state}, rc ${String(st.rc)})\n`);
  w(`results: .scratch/remote-e2e/${id}/ (report/, results.json, test-results/, output.log, health.csv, e2e-server.log)\n`);
  if (st.rc !== 0) printServerTrouble(join(dir, 'e2e-server.log'), '', (x) => d.err.write(x));
}

/** Run one job on the PC end to end; returns the process exit code. `signal` aborts (and cancels the job). */
export interface Note {
  id?: string;
  lane?: LaneName;
  stage?: 'upload' | 'fetch' | 'memory';
}
export interface RemoteOpts {
  /** Lane chosen by the router (default: pickLane). */
  lane?: LaneName;
  /** Seconds to wait for the lane lock before exit 95 (default: the lane's own wait). */
  lockWaitSec?: number;
  /** Filled in: what happened, for the router's decision. */
  note?: Note;
}
const refuseInteractive = (p: Parsed): void => {
  for (const bad of ['--headed', '--ui', '--debug']) if (p.rest.includes(bad)) throw new UsageError(`${bad} is not possible on the PC (headless only)`);
};

/** Build the job dir (snapshot, spec, scripts, meta.json) shared by the direct and the queue path. */
function prepareJob(p: Parsed, cwd: string, d: Deps, lane: LaneName, id: string, lockWaitSec?: number): { dir: string; jobDir: string; source: SourcePlan; workers: number } {
  const dir = resolve(cwd, '.scratch', 'remote-e2e', id);
  const jobDir = join(dir, 'job');
  mkdirSync(jobDir, { recursive: true });
  let source: SourcePlan;
  try {
    source = d.plan(cwd, id, { include: p.include, outDir: jobDir });
  } catch (e) {
    throw new UsageError(`snapshot failed: ${(e as Error).message}`);
  }
  const spec = buildSpec(p, id, lane, source);
  if (lockWaitSec !== undefined) spec.waitSec = lockWaitSec;
  const workers = p.workers ?? LANES[lane].workers;
  const { jobSh, startSh } = d.render(spec);
  writeFileSync(join(jobDir, 'job.sh'), jobSh, { mode: 0o755 });
  writeFileSync(join(jobDir, 'start.sh'), startSh, { mode: 0o755 });
  writeFileSync(join(jobDir, 'meta.json'), `${JSON.stringify({ id, lane, sha: source.sha, bytes: source.bytes, kind: p.kind })}\n`);
  return { dir, jobDir, source, workers };
}

export async function runRemote(p: Parsed, env: Env, cwd: string, d: Deps, signal?: AbortSignal, o: RemoteOpts = {}): Promise<number> {
  refuseInteractive(p);
  if (!(await pc.ping(d.remote))) throw new PcError('PC unreachable (ssh failed)', pc.EXIT.unreachable);
  const lane = o.lane ?? pickLane(p, d.count);
  const id = newId(lane);
  const note = o.note ?? {};
  note.id = id;
  note.lane = lane;
  const { dir, jobDir, source, workers } = prepareJob(p, cwd, d, lane, id, o.lockWaitSec);
  note.stage = 'upload';
  const sub = await pc.submit(d.remote, id, jobDir);
  delete note.stage;
  rmSync(jobDir, { recursive: true, force: true });
  d.err.write(`PC job ${id} (${lane}, ${source.ref ? 'snapshot' : 'sha'} ${source.sha.slice(0, 7)}${sub.detached ? '' : ', foreground'})\n`);
  if (p.detach) {
    d.out.write(`detached: pnpm e2e:remote -- --pc-attach ${id} | --pc-cancel ${id}\n`);
    return 0;
  }
  return await followAndReport(d, id, source.sha, lane, workers, dir, env, signal, sub.detached, note);
}

async function followAndReport(d: Deps, id: string, sha: string, lane: LaneName, workers: number, dir: string, env: Env, signal: AbortSignal | undefined, detached?: boolean, note: Note = {}): Promise<number> {
  const out = { write: (c: Buffer | string): unknown => d.out.write(redact(c.toString())) };
  const err = { write: (c: Buffer | string): unknown => d.err.write(redact(c.toString())) };
  const st = await pc.follow(d.remote, id, out, { err, ...(detached === undefined ? {} : { detached }), ...(signal ? { signal } : {}), ...d.follow });
  if (signal?.aborted) {
    await pc.cancel(d.remote, id).catch(() => false);
    d.err.write(`cancelled PC job ${id}\n`);
    return 130;
  }
  let code = pc.exitCodeOf(st);
  if (st.state !== 'lost' && code === 93) note.stage = 'memory';
  if (st.state !== 'unreachable') {
    mkdirSync(dir, { recursive: true });
    try {
      await pc.fetchResults(d.remote, id, dir);
    } catch (e) {
      d.err.write(`${redact((e as Error).message)}\n`);
      if (code === 0) {
        code = pc.EXIT.upload;
        note.stage = 'fetch';
      }
    }
    report(id, sha, lane, workers, st, dir, d, env);
  }
  return code;
}

/** Opt-in queue path: only for the full lane and only with TTE_E2E_VIA_QUEUE=1. */
export const viaQueue = (env: Env, lane: LaneName): boolean => env['TTE_E2E_VIA_QUEUE'] === '1' && lane === 'full';

const dirBytes = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? dirBytes(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);

/**
 * Full run through the PC job server's cpu-full queue (WP-Q3a). Every non-zero code is final: no Mac run, no resubmit.
 * `note.id` is set once a job was submitted.
 */
export async function runQueued(p: Parsed, env: Env, cwd: string, d: Deps, note: Note = {}, signal?: AbortSignal): Promise<number> {
  const q = d.queue;
  if (!q) throw new UsageError('queue client missing');
  refuseInteractive(p);
  if (!userToken(env)) throw new PcError('no job-server token: run pnpm gpu:setup or set TTE_JOBS_TOKEN', 97);
  if (!(await q.caps())) throw new PcError('PC unreachable or job server too old (no raw-e2e): run pnpm gpu:setup', pc.EXIT.unreachable);
  const lane: LaneName = 'full';
  const id = newId(lane);
  note.lane = lane;
  const { dir, jobDir, source, workers } = prepareJob(p, cwd, d, lane, id);
  const mb = dirBytes(jobDir) / 1048576;
  const cap = d.rawCapMb ?? 1024;
  if (mb > cap) throw new UsageError(`job dir is ${mb.toFixed(0)} MB, over the ${String(cap)} MB cap`);
  d.err.write(`PC queue job ${id} (cpu-full, sha ${source.sha.slice(0, 7)}, ${mb.toFixed(1)} MB)\n`);
  note.stage = 'upload';
  const rawId = await q.submitRaw('cpu-full', id, jobDir);
  delete note.stage;
  note.id = rawId;
  rmSync(jobDir, { recursive: true, force: true });
  d.err.write(`queued ${rawId} in cpu-full\n`);
  if (p.detach) {
    d.out.write(`detached: pnpm e2e:remote -- --pc-attach ${rawId} | --pc-cancel ${rawId}\n`);
    return 0;
  }
  return await followQueued(d, q, rawId, id, source.sha, lane, workers, dir, env, note, signal);
}

/** Wait for a raw job, fetch its out/ and print the report. An abort cancels the job once and gives 130. */
async function followQueued(d: Deps, q: QueueClient, rawId: string, id: string, sha: string, lane: LaneName, workers: number, dir: string, env: Env, note: Note, signal?: AbortSignal): Promise<number> {
  let code: number;
  try {
    const wait = q.waitRaw(rawId);
    if (signal) {
      const aborted = new Promise<'abort'>((res) => {
        if (signal.aborted) res('abort');
        else signal.addEventListener('abort', () => res('abort'), { once: true });
      });
      wait.catch(() => undefined);
      if ((await Promise.race([wait, aborted])) === 'abort') return await cancelQueued(d, q, rawId);
      code = await wait;
    } else code = await wait;
  } catch (e) {
    d.err.write(`${redact((e as Error).message)}\n`);
    return e instanceof CtlError ? e.code : pc.EXIT.unreachable;
  }
  mkdirSync(dir, { recursive: true });
  try {
    await q.fetchRaw(rawId, dir);
  } catch (e) {
    d.err.write(`${redact((e as Error).message)}\n`);
    if (code === 0) {
      code = pc.EXIT.upload;
      note.stage = 'fetch';
    }
  }
  const statusPath = join(dir, 'status.json');
  const st: JobStatus = existsSync(statusPath) ? pc.parseStatus(readFileSync(statusPath, 'utf8')) : { state: code === 93 ? 'lost' : 'done', rc: code };
  report(id, sha, lane, workers, st, dir, d, env);
  return code;
}

async function cancelQueued(d: Deps, q: QueueClient, rawId: string): Promise<number> {
  try {
    await q.cancelRaw(rawId);
    d.err.write(`cancelled PC job ${rawId}\n`);
  } catch (e) {
    d.err.write(`${redact((e as Error).message)}\ncancel failed: pnpm e2e:remote -- --pc-cancel ${rawId}\n`);
  }
  return 130;
}

/** Router entry; returns the exit code. */
export async function runPc(p: Parsed, env: Env, cwd: string, d: Deps, signal?: AbortSignal, o: RemoteOpts = {}): Promise<number> {
  if (p.status) d.out.write(redact(`${await pc.status(d.remote)}`));
  else if (p.jobs) for (const j of await pc.jobs(d.remote)) d.out.write(redact(`${j.id}\t${j.state}\t${String(j.rc ?? '')}\n`));
  else if (p.cancel?.startsWith('raw-')) {
    if (!d.queue) throw new UsageError('queue client missing');
    const ok = await d.queue.cancelRaw(p.cancel).then(() => true, () => false);
    d.out.write(`${ok ? 'cancelled' : 'cancel failed'} ${p.cancel}\n`);
    return ok ? 0 : 1;
  } else if (p.cancel) d.out.write(`${(await pc.cancel(d.remote, p.cancel)) ? 'cancelled' : 'cancel failed'} ${p.cancel}\n`);
  else if (p.attach?.startsWith('raw-')) {
    if (!d.queue) throw new UsageError('queue client missing');
    const id = p.attach.slice(4);
    const lane = (/^\d{8}-\d{6}-(short|full)-/.exec(id)?.[1] ?? 'full') as LaneName;
    return await followQueued(d, d.queue, p.attach, id, '0000000', lane, LANES[lane].workers, resolve(cwd, '.scratch', 'remote-e2e', id), env, o.note ?? {}, signal);
  } else if (p.attach) {
    const id = p.attach;
    const lane = (/^\d{8}-\d{6}-(short|full)-/.exec(id)?.[1] ?? 'full') as LaneName;
    return await followAndReport(d, id, '0000000', lane, LANES[lane].workers, resolve(cwd, '.scratch', 'remote-e2e', id), env, signal, undefined, o.note);
  } else return await runRemote(p, env, cwd, d, signal, o);
  return 0;
}

let signalsHooked = false;
/** The Mac run through the browser slot. With a `reason` this is a fallback: a banner says so. */
export function runLocal(p: Parsed, env: Env = process.env, reason?: string, macLoad?: number): Promise<number> {
  const json = env['PLAYWRIGHT_JSON_OUTPUT_FILE'] && p.kind !== 'flake' && !p.rest.some((a) => a.startsWith('--reporter'));
  const base = p.kind === 'flake' ? ['tsx', 'tools/ci/e2e-flake.ts', ...p.rest] : ['playwright', 'test', ...kindArgs(p), ...(p.workers ? [`--workers=${String(p.workers)}`] : [])];
  const cmd = json ? [...base, '--reporter=list,html,json'] : base;
  if (reason) {
    const lim = env['TTE_MAC_LOAD_MAX'] ?? String(DEFAULT_LIMITS.macLoadMax);
    process.stderr.write(`!!! E2E FALLBACK -> MAC: ${redact(reason)}. Mac load ${macLoad === undefined ? '?' : macLoad.toFixed(1)}/${lim}. Short run only. Say so in your report.\n`);
  }
  const since = new Date().toISOString();
  return new Promise((res) => {
    const c = spawn('tsx', ['tools/ci/browser-slot.ts', '--', ...cmd], { stdio: 'inherit' });
    if (!signalsHooked) {
      signalsHooked = true;
      for (const s of ['SIGINT', 'SIGTERM'] as const) process.on(s, () => c.kill(s));
    }
    c.on('close', (code, sig) => {
      const rc = code ?? (sig ? 128 : 1);
      if (rc !== 0 && p.kind !== 'flake') printServerTrouble(logPathFor(env), since, (x) => process.stderr.write(x));
      res(rc);
    });
    c.on('error', () => res(1));
  });
}

function noteLocal(cwd: string): void {
  const load = loadavg()[0]?.toFixed(1) ?? '?';
  process.stderr.write(`Mac browser e2e (load ${load})\n`);
  const g = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' });
  if (g.status === 0) appendFileSync(resolve(cwd, g.stdout.trim(), 'tte-e2e-local.log'), `${new Date().toISOString()} load ${load} ${cwd.split('/').pop() ?? ''}\n`);
}

/** Everything the decide loop touches outside the PC transport; tests replace it. */
export interface Io {
  /** `fresh` skips the cache. */
  probe(fresh: boolean): Promise<PcView>;
  noteExit(code: number): void;
  macLoad(): number | undefined;
  sleep(sec: number, signal?: AbortSignal): Promise<void>;
  local(p: Parsed, reason: string, macLoad: number | undefined): Promise<number>;
}

const num = (v: string | undefined, dflt: number): number => (v !== undefined && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : dflt);
export function limitsOf(env: Env): Limits {
  const d = DEFAULT_LIMITS;
  return {
    ...d,
    macLoadMax: num(env['TTE_MAC_LOAD_MAX'], d.macLoadMax),
    macLoadWaitSec: num(env['TTE_MAC_LOAD_WAIT_SEC'], d.macLoadWaitSec),
    pcBusyWaitSec: num(env['TTE_PC_BUSY_WAIT_SEC'], d.pcBusyWaitSec),
    pcWaitMaxSec: num(env['TTE_PC_WAIT_MAX_SEC'], d.pcWaitMaxSec),
  };
}
export function policyOf(p: Parsed, env: Env): Policy {
  if (p.fallback) return p.fallback;
  const v = env['TTE_E2E_FALLBACK']?.trim();
  if (!v) return 'mac';
  if (v !== 'mac' && v !== 'wait' && v !== 'fail') throw new UsageError('TTE_E2E_FALLBACK is mac, wait or fail');
  return v;
}

/** After these PC exits the call is over; no fresh probe is needed. */
const FINAL_EXITS = [0, 1, 2, 124, 130];

/** The queue branch of runRouted: no probe, no wait, no Mac. */
async function routeQueued(p: Parsed, env: Env, cwd: string, d: Deps, signal?: AbortSignal): Promise<number> {
  const note: Note = {};
  let code: number;
  try {
    code = await runQueued(p, env, cwd, d, note, signal);
  } catch (e) {
    if (!(e instanceof PcError || e instanceof UsageError)) throw e;
    d.err.write(`${redact(e.message)}\n`);
    code = e instanceof PcError ? e.code : 2;
  }
  d.err.write(`e2e ran on: ${note.id ? `PC (queue job ${note.id}, full lane)` : 'nowhere (queue job not submitted)'} -> exit ${String(code)}\n`);
  return code;
}

/** The decide loop for a run (not admin): probe, decide, then run on the PC, run on the Mac or wait, until a final exit. */
export async function runRouted(p: Parsed, env: Env, cwd: string, d: Deps, io: Io, signal?: AbortSignal): Promise<number> {
  const limits = limitsOf(env);
  const policy = policyOf(p, env);
  const forced = p.lane !== undefined || p.full;
  const memo = new Map<string, number | undefined>();
  const count: Counter = (a) => {
    const k = a.join('\u0000');
    if (!memo.has(k)) memo.set(k, d.count(a));
    return memo.get(k);
  };
  const tests = p.lane === 'full' || p.full ? undefined : testsOf(p, count);
  const lane = pickLane(p, count);
  if (viaQueue(env, lane)) return await routeQueued(p, env, cwd, d, signal);
  const ask: Ask = { kind: p.kind, tests, lane, laneForced: forced, pc: p.mode === 'pc', detach: p.detach, policy, allowMac: env['TTE_ALLOW_MAC_E2E'] === '1' };
  const macOk = policy === 'mac' && macEligible(ask, limits);
  const h: History = { pcAttempts: 0, macAttempts: 0 };
  let waited = 0;
  let fresh = false;
  let view: PcView | undefined;
  let lastId: string | undefined;
  let ranOn = 'nowhere';
  let code = 2;
  for (;;) {
    if (signal?.aborted) {
      code = 130;
      break;
    }
    const last = h.last;
    const reprobe = last?.where === 'pc' ? !FINAL_EXITS.includes(last.exit) : last?.where === 'mac' && last.exit === 75;
    if (!view || reprobe || fresh) view = await io.probe(fresh || reprobe);
    fresh = false;
    const load = io.macLoad();
    const step: Step = decide(ask, view, h, load, waited, limits);
    if (step.do === 'fail') {
      code = step.code;
      if (step.reason !== 'final' && step.reason !== 'Mac run finished') d.err.write(`${redact(step.reason)}\n`);
      break;
    }
    if (step.do === 'wait') {
      if (waited === 0 || waited % 300 < step.sec) d.err.write(`waiting ${String(step.sec)} s: ${redact(step.why)} (waited ${String(waited)} s)\n`);
      await io.sleep(step.sec, signal);
      if (signal?.aborted) {
        code = 130;
        break;
      }
      waited += step.sec;
      fresh = true;
      continue;
    }
    if (step.do === 'mac') {
      h.macAttempts++;
      ranOn = `Mac (fallback: ${redact(step.reason)})`;
      code = await io.local(p, step.reason, load);
      h.last = { where: 'mac', exit: code };
      continue;
    }
    const note: Note = {};
    h.pcAttempts++;
    if (step.attach) h.reattached = true;
    if (step.attach && !lastId) {
      d.err.write('cannot reattach: no job id\n');
      code = 255;
      break;
    }
    const target = step.attach && lastId ? { ...p, attach: lastId } : p;
    let x: number;
    try {
      x = await runPc(target, env, cwd, d, signal, { lane: step.lane, note, ...(macOk ? { lockWaitSec: Math.max(0, limits.pcBusyWaitSec - waited) } : {}) });
    } catch (e) {
      if (!(e instanceof PcError)) throw e;
      d.err.write(`${redact(e.message)}\n`);
      x = e.code;
    }
    if (note.id) lastId = note.id;
    ranOn = `PC (job ${lastId ?? '?'}, ${note.lane ?? step.lane} lane)`;
    io.noteExit(x);
    code = x;
    h.last = { where: 'pc', exit: x, ...(note.stage ? { stage: note.stage } : {}) };
    fresh = true;
  }
  d.err.write(`e2e ran on: ${ranOn} -> exit ${String(code)}\n`);
  return code;
}

export async function main(argv: readonly string[], env: Env = process.env, cwd = process.cwd()): Promise<number> {
  try {
    const p = parseArgs(argv);
    const alias = remoteAlias(env, cwd);
    const r = route(p, env, alias);
    if (r.where === 'refuse') throw new UsageError(r.why);
    if (r.where === 'local') {
      if (alias && (p.mode === 'local' || env['TTE_E2E_LOCAL'] === '1')) noteLocal(cwd);
      return await runLocal(p, env);
    }
    const remote = defaultRemote(alias as string, env);
    const d: Deps = { remote, plan: (c, id, o) => planSource(c, id, o), render: renderJob, count: realCount, out: process.stdout, err: process.stderr };
    if (env['TTE_E2E_VIA_QUEUE'] === '1' || p.attach?.startsWith('raw-') || p.cancel?.startsWith('raw-')) d.queue = queueClient(remote, { ...env }, cwd, process.stderr);
    const ctl = new AbortController();
    if (!p.detach) {
      for (const s of ['SIGINT', 'SIGTERM'] as const) {
        process.on(s, () => {
          // Say who stopped the run: otherwise the aborted ssh below reads as a network drop.
          if (!ctl.signal.aborted) process.stderr.write(`router received ${s} (stopped from outside, not an ssh failure); cancelling the PC job\n`);
          ctl.abort();
        });
      }
    }
    if (p.attach !== undefined || p.cancel !== undefined || p.jobs || p.status) return await runPc(p, env, cwd, d, ctl.signal);
    const file = cacheFile(cwd);
    const ttl = num(env['TTE_PC_PROBE_TTL_SEC'], 60);
    const io: Io = {
      probe: async (fresh) => {
        const hit = fresh ? undefined : readCache(file, Date.now(), ttl, keyOf(alias as string));
        if (hit) return hit;
        const pr = await realProbe(remote);
        writeCache(file, pr);
        return pr;
      },
      noteExit: (c) => {
        noteExit(file, c, Date.now());
      },
      macLoad: () => loadavg()[0],
      sleep: (sec, sg) =>
        new Promise((res) => {
          if (sg?.aborted) return res();
          const t = setTimeout(res, sec * 1000);
          sg?.addEventListener('abort', () => {
            clearTimeout(t);
            res();
          }, { once: true });
        }),
      local: (pp, reason, load) => runLocal(pp, env, reason, load),
    };
    return await runRouted(p, env, cwd, d, io, ctl.signal);
  } catch (e) {
    process.stderr.write(`${redact((e as Error).message)}\n`);
    return e instanceof PcError ? e.code : 2;
  }
}

if (process.argv[1]?.endsWith('e2e-route.ts')) void main(process.argv.slice(2)).then((c) => process.exit(c));
