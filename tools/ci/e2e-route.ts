/**
 * The e2e router behind `pnpm e2e`, `e2e:smoke`, `e2e:pages`, `e2e:itch`, `e2e:flake`, `e2e:remote` and `e2e:local`:
 *   tsx tools/ci/e2e-route.ts <run|smoke|pages|itch|flake> [router flags] [-- playwright args]
 * With a remote configured (TTE_REMOTE, else `git config tte.remote`: an ssh alias) the run goes to the GPU PC: the worktree is
 * snapshotted (tools/ci/pc-snapshot.ts), a job is rendered (pc-job.ts), uploaded and followed (pc-remote.ts), and the report and
 * failures are copied to .scratch/remote-e2e/<id>/. Without a remote, or with CI, TTE_E2E_LOCAL=1, `--list` or `--local`, the old
 * local behaviour (tools/ci/browser-slot.ts) runs unchanged. Router flags are exact tokens: --pc --local --smoke --full
 * --workers N --pc-lane <short|full> --pc-include <p> --pc-fetch <p> --pc-detach --pc-attach <id> --pc-cancel <id> --pc-jobs --pc-status.
 * Exit codes: Playwright's 0/1, 2 usage, 3 upload, 92 bundle, 93 job lost, 94 PC unreachable, 95 PC busy, 96 frames, 124 hard
 * timeout, 255 ssh given up. Output is redacted (addresses, user@host, home paths). Plan: ~/claudetmp/plans/e2e-on-4060-plan.md (R3).
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join, resolve } from 'node:path';
import { LANES, renderJob, type JobSpec, type LaneName } from './pc-job';
import * as pc from './pc-remote';
import { PcError, type JobStatus, type Remote } from './pc-remote';
import { planSource, type SourcePlan } from './pc-snapshot';

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
  rest: string[];
}
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
    else if (a === '--pc-attach') p.attach = val(i++, a);
    else if (a === '--pc-cancel') p.cancel = val(i++, a);
    else if (a === '--workers' && p.kind !== 'flake') {
      const n = Number.parseInt(val(i++, a), 10);
      if (!Number.isInteger(n) || n < 1) throw new UsageError('--workers needs a positive integer');
      p.workers = n;
    } else p.rest.push(a);
  }
  return p;
}

/** Remote alias: TTE_REMOTE, else `git config tte.remote`. */
export function remoteAlias(env: Env, cwd = process.cwd()): string | undefined {
  const e = env['TTE_REMOTE']?.trim();
  if (e) return e;
  const r = spawnSync('git', ['config', '--get', 'tte.remote'], { cwd, encoding: 'utf8' });
  const v = r.status === 0 ? r.stdout.trim() : '';
  return v || undefined;
}

export type Route = { where: 'local' } | { where: 'remote' } | { where: 'refuse'; why: string };
/** The route table. `alias` is the configured remote, if any. */
export function route(p: Parsed, env: Env, alias: string | undefined): Route {
  const admin = p.attach !== undefined || p.cancel !== undefined || p.jobs || p.status;
  if (admin) return alias ? { where: 'remote' } : { where: 'refuse', why: 'no PC configured (git config tte.remote <ssh alias> or TTE_REMOTE)' };
  if (env['CI'] || env['TTE_E2E_LOCAL'] === '1' || p.rest.includes('--list')) return { where: 'local' };
  if (p.mode === 'local') {
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
export function pickLane(p: Parsed, count: Counter): LaneName {
  if (p.lane) return p.lane;
  if (p.full) return 'full';
  const base = kindArgs(p);
  const n = count(p.kind === 'flake' ? dropFlags(base, ['--repeat', '--summary-json']) : dropFlags(base, ['--repeat-each']));
  const reps = repeatOf(base);
  return n === undefined || n * reps > LANE_TEST_LIMIT ? 'full' : 'short';
}

/** Hide addresses, user@host and home paths: output gets pasted into ideas and commits. */
export function redact(s: string): string {
  return s
    .replace(/(?<![\w.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\w.])/g, '<addr>')
    .replace(/(?<![\w.-])[\w.-]+@[\w-]+(?:\.[\w-]+)+/g, '<user@host>')
    .replace(/\/home\/[\w.-]+\//g, '~/')
    .replace(/\/Users\/[\w.-]+\//g, '~/');
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
    env: {},
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
  w(`results: .scratch/remote-e2e/${id}/ (report/, results.json, test-results/, output.log, health.csv)\n`);
}

/** Run one job on the PC end to end; returns the process exit code. `signal` aborts (and cancels the job). */
export async function runRemote(p: Parsed, env: Env, cwd: string, d: Deps, signal?: AbortSignal): Promise<number> {
  for (const bad of ['--headed', '--ui', '--debug']) if (p.rest.includes(bad)) throw new UsageError(`${bad} is not possible on the PC (headless only)`);
  if (!(await pc.ping(d.remote))) throw new PcError('PC unreachable (ssh failed)', pc.EXIT.unreachable);
  const lane = pickLane(p, d.count);
  const id = newId(lane);
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
  const workers = p.workers ?? LANES[lane].workers;
  const { jobSh, startSh } = d.render(spec);
  writeFileSync(join(jobDir, 'job.sh'), jobSh, { mode: 0o755 });
  writeFileSync(join(jobDir, 'start.sh'), startSh, { mode: 0o755 });
  writeFileSync(join(jobDir, 'meta.json'), `${JSON.stringify({ id, lane, sha: source.sha, bytes: source.bytes, kind: p.kind })}\n`);
  const sub = await pc.submit(d.remote, id, jobDir);
  rmSync(jobDir, { recursive: true, force: true });
  d.err.write(`PC job ${id} (${lane}, ${source.ref ? 'snapshot' : 'sha'} ${source.sha.slice(0, 7)}${sub.detached ? '' : ', foreground'})\n`);
  if (p.detach) {
    d.out.write(`detached: pnpm e2e:remote -- --pc-attach ${id} | --pc-cancel ${id}\n`);
    return 0;
  }
  return await followAndReport(d, id, source.sha, lane, workers, dir, env, signal, sub.detached);
}

async function followAndReport(d: Deps, id: string, sha: string, lane: LaneName, workers: number, dir: string, env: Env, signal: AbortSignal | undefined, detached?: boolean): Promise<number> {
  const out = { write: (c: Buffer | string): unknown => d.out.write(redact(c.toString())) };
  const err = { write: (c: Buffer | string): unknown => d.err.write(redact(c.toString())) };
  const st = await pc.follow(d.remote, id, out, { err, ...(detached === undefined ? {} : { detached }), ...(signal ? { signal } : {}), ...d.follow });
  if (signal?.aborted) {
    await pc.cancel(d.remote, id).catch(() => false);
    d.err.write(`cancelled PC job ${id}\n`);
    return 130;
  }
  let code = pc.exitCodeOf(st);
  if (st.state !== 'unreachable') {
    mkdirSync(dir, { recursive: true });
    try {
      await pc.fetchResults(d.remote, id, dir);
    } catch (e) {
      d.err.write(`${redact((e as Error).message)}\n`);
      if (code === 0) code = pc.EXIT.upload;
    }
    report(id, sha, lane, workers, st, dir, d, env);
  }
  return code;
}

/** Router entry; returns the exit code. */
export async function runPc(p: Parsed, env: Env, cwd: string, d: Deps, signal?: AbortSignal): Promise<number> {
  if (p.status) d.out.write(redact(`${await pc.status(d.remote)}`));
  else if (p.jobs) for (const j of await pc.jobs(d.remote)) d.out.write(redact(`${j.id}\t${j.state}\t${String(j.rc ?? '')}\n`));
  else if (p.cancel) d.out.write(`${(await pc.cancel(d.remote, p.cancel)) ? 'cancelled' : 'cancel failed'} ${p.cancel}\n`);
  else if (p.attach) {
    const id = p.attach;
    const lane = (/^\d{8}-\d{6}-(short|full)-/.exec(id)?.[1] ?? 'full') as LaneName;
    return await followAndReport(d, id, '0000000', lane, LANES[lane].workers, resolve(cwd, '.scratch', 'remote-e2e', id), env, signal);
  } else return await runRemote(p, env, cwd, d, signal);
  return 0;
}

function runLocal(p: Parsed): Promise<number> {
  const cmd = p.kind === 'flake' ? ['tsx', 'tools/ci/e2e-flake.ts', ...p.rest] : ['playwright', 'test', ...kindArgs(p), ...(p.workers ? [`--workers=${String(p.workers)}`] : [])];
  return new Promise((res) => {
    const c = spawn('tsx', ['tools/ci/browser-slot.ts', '--', ...cmd], { stdio: 'inherit' });
    for (const s of ['SIGINT', 'SIGTERM'] as const) process.on(s, () => c.kill(s));
    c.on('close', (code, sig) => res(code ?? (sig ? 128 : 1)));
    c.on('error', () => res(1));
  });
}

function noteLocal(cwd: string): void {
  const load = loadavg()[0]?.toFixed(1) ?? '?';
  process.stderr.write(`Mac browser e2e (load ${load})\n`);
  const g = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' });
  if (g.status === 0) appendFileSync(resolve(cwd, g.stdout.trim(), 'tte-e2e-local.log'), `${new Date().toISOString()} load ${load} ${cwd.split('/').pop() ?? ''}\n`);
}

export async function main(argv: readonly string[], env: Env = process.env, cwd = process.cwd()): Promise<number> {
  try {
    const p = parseArgs(argv);
    const alias = remoteAlias(env, cwd);
    const r = route(p, env, alias);
    if (r.where === 'refuse') throw new UsageError(r.why);
    if (r.where === 'local') {
      if (p.mode === 'local' && alias) noteLocal(cwd);
      return await runLocal(p);
    }
    const d: Deps = { remote: defaultRemote(alias as string, env), plan: (c, id, o) => planSource(c, id, o), render: renderJob, count: realCount, out: process.stdout, err: process.stderr };
    const ctl = new AbortController();
    const stop = (): void => ctl.abort();
    if (!p.detach) for (const s of ['SIGINT', 'SIGTERM'] as const) process.on(s, stop);
    return await runPc(p, env, cwd, d, ctl.signal);
  } catch (e) {
    process.stderr.write(`${redact((e as Error).message)}\n`);
    return e instanceof PcError ? e.code : 2;
  }
}

if (process.argv[1]?.endsWith('e2e-route.ts')) void main(process.argv.slice(2)).then((c) => process.exit(c));
