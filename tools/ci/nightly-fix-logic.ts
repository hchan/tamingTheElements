// Nightly fix loop: pure logic (guardrails, prompts, triage, push preconditions, report). No fs, git, clock or claude here;
// tools/ci/nightly-fix.ts does the I/O. Tests: tests/repo/nightly-fix.test.ts. Design: ideas/in-progress/nightly-fix-loop.md.
import type { NightlyStatus, TestRef } from './nightly-status';

export const MAX_ROUNDS = 3;
export const ROUND_TIMEOUT_MS = 25 * 60_000;
/** Router exits after which the loop stops and reports (89 no runner, 94 unreachable, 95 busy, 96 refused). */
export const STOP_EXITS: readonly number[] = [89, 94, 95, 96];

export type Outcome = 'fixed' | 'flaky' | 'needs-human' | 'unfixed';
export type FixState = 'fixed-pushed' | 'needs-human' | 'red-unfixed';

export interface Failure extends TestRef {
  readonly message: string;
  readonly tracePath: string;
}
export interface FailureResult {
  readonly file: string;
  readonly title: string;
  readonly outcome: Outcome;
  readonly rounds: number;
  readonly reason: string;
}

// ---- hard stops (enforced on the diff, not only in the prompt) ----
const FORBIDDEN: readonly RegExp[] = [
  /^src\/core(\/|$)/, // includes SIM_VERSION (src/core/version.ts)
  /^tests\/fixtures(\/|$)/,
  /^tools\/ci\/size-budget\.json$/,
  /^docs\/REPO-MAP\.md$/,
  /^src\/game\/assets\/manifest[^/]*$/,
  /^(package\.json|pnpm-lock\.yaml|CLAUDE\.md)$/,
  /^\.claude(\/|$)/,
  /^\.github(\/|$)/,
  /^tools\/ci\/(nightly-[^/]*|known-red\.json|gate\.ts|e2e-route\.ts)$/,
  /(^|\/)(user\.properties|\.env[^/]*|id_[a-z0-9]+|[^/]*\.(pem|key|p12))$/i,
  /(^|\/)(credentials|secrets?)[^/]*$/i,
];

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
}
export function isForbiddenPath(p: string): boolean {
  const n = normalizePath(p);
  return n.startsWith('/') || n.split('/').includes('..') || FORBIDDEN.some((re) => re.test(n));
}
export function forbiddenTouched(paths: readonly string[]): string[] {
  return paths.filter(isForbiddenPath);
}
/** Paths from `git status --porcelain=v1 -z` (a rename lists the new path, then the old one as its own record). */
export function parsePorcelainZ(out: string): string[] {
  const recs = out.split('\0').filter(Boolean);
  const paths: string[] = [];
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i] as string;
    paths.push(rec.slice(3));
    if (rec[0] === 'R' || rec[0] === 'C') paths.push(recs[++i] ?? '');
  }
  return paths.filter(Boolean);
}

// ---- when and how often ----
export const shouldRun = (s: NightlyStatus | undefined): boolean => s?.state === 'red' && s.unrecorded.length > 0;
export const roundAllowed = (roundsDone: number): boolean => roundsDone < MAX_ROUNDS;
/** After a re-run exit other than green (0) or red (1) the whole loop stops (89/94/95/96 and anything unknown). */
export const stopsLoop = (exit: number): boolean => STOP_EXITS.includes(exit) || (exit !== 0 && exit !== 1);
export const specPath = (file: string): string => (file.includes('/') ? file : `tests/e2e/${file}`);

// ---- failure extraction from the collected Playwright JSON ----
interface PwRes {
  status?: string;
  errors?: { message?: string }[];
  error?: { message?: string };
  attachments?: { name?: string; path?: string }[];
}
interface PwNode {
  file?: string;
  specs?: { title?: string; file?: string; tests?: { results?: PwRes[] }[] }[];
  suites?: PwNode[];
}
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

export function extractFailures(json: unknown, wanted: readonly TestRef[]): Failure[] {
  const found = new Map<string, Failure>();
  const walk = (n: PwNode, file: string): void => {
    const f = n.file ?? file;
    for (const sp of n.specs ?? []) {
      const res = (sp.tests ?? []).flatMap((t) => t.results ?? []).filter((r) => r.status === 'failed' || r.status === 'timedOut');
      const last = res[res.length - 1];
      if (!last) continue;
      const msg = (last.errors?.[0]?.message ?? last.error?.message ?? '').replace(ANSI, '').slice(0, 1500);
      const trace = last.attachments?.find((a) => a.name === 'trace')?.path ?? '';
      found.set(`${sp.file ?? f}\0${sp.title ?? ''}`, { file: sp.file ?? f, title: sp.title ?? '', message: msg, tracePath: trace });
    }
    for (const c of n.suites ?? []) walk(c, f);
  };
  for (const s of ((json ?? {}) as { suites?: PwNode[] }).suites ?? []) walk(s, s.file ?? '');
  return wanted.map((w) => found.get(`${w.file}\0${w.title}`) ?? { ...w, message: '(no error text in the collected results)', tracePath: '' });
}

// ---- the headless claude call ----
export const ALLOWED_TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(git diff:*)', 'Bash(git status:*)', 'Bash(git log:*)', 'Bash(corepack pnpm lint:*)', 'Bash(corepack pnpm typecheck:*)', 'Bash(corepack pnpm exec vitest:*)'];
export const DENIED_TOOLS = ['Bash(git push:*)', 'Bash(git commit:*)', 'Bash(git reset:*)', 'Bash(git checkout:*)', 'Bash(rm:*)', 'WebFetch', 'WebSearch'];

export function claudeArgs(prompt: string): string[] {
  return ['-p', prompt, '--allowedTools', ALLOWED_TOOLS.join(','), '--disallowedTools', DENIED_TOOLS.join(','), '--permission-mode', 'acceptEdits', '--max-turns', '40'];
}

export function buildPrompt(f: Failure, round: number, previous: string): string {
  return [
    `You are fixing one red nightly e2e test of tamingTheElements (Phaser 4 + TypeScript). Round ${String(round)} of ${String(MAX_ROUNDS)}.`,
    `Spec: ${specPath(f.file)}`,
    `Title: ${f.title}`,
    `Error:\n${f.message}`,
    f.tracePath ? `Playwright trace (on the PC run, may not be readable here): ${f.tracePath}` : '',
    previous ? `Your previous attempt did not turn it green. Router output of the re-run:\n${previous}` : '',
    'Find the cause (test timing or a missing wait, an app race, or a real regression) and make the smallest fix in the test or in src/ outside src/core.',
    'Hard stops: never edit src/core, tests/fixtures (goldens, baselines), SIM_VERSION, tools/ci/*, docs/REPO-MAP.md, the asset manifest, package.json, lockfiles, .claude, .github or anything credential-like. If the fix needs one of those, change nothing and answer needs-human.',
    'Do not commit, push, run browsers or edit known-red.json; the harness commits, re-runs the spec on the PC and records known reds.',
    'If you judge it a one-off environment flake (no code change is justified), change nothing and say so.',
    'End your answer with exactly one line: TRIAGE: {"verdict":"fixed|flaky|needs-human","reason":"<one sentence>"}',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function parseTriage(text: string): { verdict: 'fixed' | 'flaky' | 'needs-human' | 'none'; reason: string } {
  const m = /^TRIAGE:\s*(\{.*\})\s*$/m.exec(text);
  try {
    const o = JSON.parse(m?.[1] ?? '') as { verdict?: unknown; reason?: unknown };
    if (o.verdict === 'fixed' || o.verdict === 'flaky' || o.verdict === 'needs-human') return { verdict: o.verdict, reason: typeof o.reason === 'string' ? o.reason : '' };
  } catch {
    /* fall through */
  }
  return { verdict: 'none', reason: '' };
}

// ---- triage of one round ----
export interface RoundInput {
  readonly round: number;
  readonly forbidden: readonly string[];
  readonly agent: 'fixed' | 'flaky' | 'needs-human' | 'none';
  readonly diffEmpty: boolean;
  /** Re-run of the failed spec: 0 green, 1 red. */
  readonly rerunExit: number;
}
/** 'retry' means run another round. A green re-run with an empty diff is noise (recorded known-red), with a diff it is a fix. */
export function triage(i: RoundInput): { outcome: Outcome | 'retry'; reason: string } {
  if (i.forbidden.length) return { outcome: 'needs-human', reason: `diff touched forbidden paths: ${i.forbidden.join(', ')}` };
  if (i.agent === 'needs-human') return { outcome: 'needs-human', reason: 'the agent judged it needs a human' };
  if (i.rerunExit === 0) return i.diffEmpty ? { outcome: 'flaky', reason: 'green on re-run with no code change' } : { outcome: 'fixed', reason: 'green on re-run after the fix' };
  if (!roundAllowed(i.round)) return { outcome: 'unfixed', reason: `still red after ${String(MAX_ROUNDS)} rounds` };
  return { outcome: 'retry', reason: 'still red' };
}

// ---- push ----
export interface PushInput {
  readonly hasCommits: boolean;
  readonly shaOnOrigin: boolean;
  readonly mergeOk: boolean;
  readonly forbidden: readonly string[];
  readonly markersClean: boolean;
  readonly gatePushOk: boolean;
  readonly rerunGreen: boolean;
  readonly originUnmoved: boolean;
  readonly noEnvOverride: boolean;
}
/** Every reason the push must not happen; empty means push (plain `git push origin HEAD:main`, never forced). */
export function pushBlockers(i: PushInput): string[] {
  const b: string[] = [];
  if (!i.hasCommits) b.push('nothing to push');
  if (!i.noEnvOverride) b.push('CI, TTE_E2E_LOCAL or TTE_ALLOW_MAC_E2E is set');
  if (!i.shaOnOrigin) b.push('the nightly ran on commits that are not on origin/main');
  if (!i.mergeOk) b.push('merge --no-ff into main failed');
  if (i.forbidden.length) b.push(`merged diff touches forbidden paths: ${i.forbidden.join(', ')}`);
  if (!i.markersClean) b.push('conflict markers found');
  if (!i.gatePushOk) b.push('gate:push failed');
  if (!i.rerunGreen) b.push('re-run of the failed specs is not green');
  if (!i.originUnmoved) b.push('origin/main moved during the run');
  return b;
}

export function finalState(results: readonly FailureResult[], pushed: boolean): FixState {
  if (results.some((r) => r.outcome === 'needs-human')) return 'needs-human';
  if (pushed && results.every((r) => r.outcome === 'fixed' || r.outcome === 'flaky')) return 'fixed-pushed';
  return 'red-unfixed';
}

export const mergeSubject = (what: string): string => `Merge ${what} (nightly-fix)`;
export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'test';

export interface FixStatus {
  readonly schema: 1;
  readonly state: FixState;
  readonly sha: string;
  readonly finishedAt: string;
  readonly pushed: boolean;
  readonly results: readonly FailureResult[];
  readonly blockers: readonly string[];
}
export function describeFix(s: FixStatus | undefined): string[] {
  if (!s) return [];
  const out = [`nightly fix: ${s.state}${s.pushed ? ' (pushed)' : ''} for ${s.sha.slice(0, 7)} at ${s.finishedAt}`];
  for (const r of s.results) out.push(`  ${r.outcome}: ${r.file}: ${r.title} (${String(r.rounds)} round(s)) ${r.reason}`);
  for (const b of s.blockers) out.push(`  blocked: ${b}`);
  return out;
}
