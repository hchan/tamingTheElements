// Nightly fix loop: pure logic (guardrails, prompts, triage, push preconditions, report). No fs, git, clock or claude here;
// tools/ci/nightly-fix.ts does the I/O. Tests: tests/repo/nightly-fix.test.ts. Design: ideas/in-progress/nightly-fix-loop.md.
import type { PushStatus } from './nightly-push';
import { describeStatus, isStale, parseResults, unrecordedFailures, type KnownRed, type NightlyStatus, type Results, type TestRef } from './nightly-status';
import { redact } from './redact';
import type { Tier } from './test-tiers';

export const MAX_ROUNDS = 3;
export const ROUND_TIMEOUT_MS = 25 * 60_000;
export const RERUN_TIMEOUT_MS = 40 * 60_000;
export const GATE_TIMEOUT_MS = 90 * 60_000;
/** More real (P0/P1, or unclassified) distinct reds than this is a broken night, not something to fix by loop: report needs-human, no rounds. */
export const MAX_REAL_REDS = 8;
/** Absolute cap of one run; the real stop is `deadlineFor` (07:00 for a night run, 22:00 for a manual daytime run). */
export const MAX_RUN_MS = 6 * 3600_000;
export const STOP_HOUR = 22;
/** Local hour of the hard stop for a run that starts after midnight (the owner's morning; nothing starts after it that cannot finish). */
export const MORNING_STOP_HOUR = 7;
/** Full re-runs after fixing (fix, full e2e on the fixed tree, collect, fix again): at most this many. */
export const MAX_FULL_CYCLES = 2;
/** Estimate of a full PC run plus collect; a full re-run is only started when this much time is left (an estimate: tune after the first real night). */
export const FULL_RUN_MS = 90 * 60_000;
/** A fix round (claude plus the spec re-run) is only started when this much time is left. */
/** Budget for gate:push after a full run (its hard cap is GATE_TIMEOUT_MS, but it normally takes far less). */
export const GATE_PUSH_ESTIMATE_MS = 15 * 60_000;
export const MIN_ROUND_MS = 20 * 60_000;
/** Collect retry: the 02:00 run waits this long between tries while the 23:00 run is unfinished, until the cutoff (04:30). */
export const RETRY_WAIT_MS = 20 * 60_000;
export const RETRY_CUTOFF = { hour: 4, minute: 30 } as const;
/** Router exits recorded by collect that mean the PC job is not finished or not reachable yet (94 unreachable, 95 busy). */
export const RETRY_EXITS: readonly number[] = [94, 95];
/** Above the worst-case run (4 h of rounds plus the merge re-runs and gate:push), so a live run is never taken over. */
export const LOCK_STALE_MS = 12 * 3600_000;
/** Router exits after which the loop stops and reports (89 no runner, 94 unreachable, 95 busy, 96 refused). */
export const STOP_EXITS: readonly number[] = [89, 94, 95, 96];

export type Outcome = 'fixed' | 'flaky' | 'p2-record' | 'needs-human' | 'unfixed';
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
  /** Report-only context (optional so older statuses still read). */
  readonly tier?: Tier;
  readonly errorTail?: readonly string[];
}

// ---- hard stops (enforced on the diff, not only in the prompt) ----
const FORBIDDEN: readonly RegExp[] = [
  /^src\/core(\/|$)/, // includes SIM_VERSION (src/core/version.ts)
  /^tests\/fixtures(\/|$)/,
  /^tests\/repo(\/|$)/, // the repo guard tests
  /^tools(\/|$)/, // all tooling (gates, router, size budget, nightly harness)
  /^docs\/REPO-MAP\.md$/,
  /^src\/game\/assets\/manifest[^/]*$/,
  /^(package\.json|pnpm-lock\.yaml|CLAUDE\.md)$/,
  /^(eslint\.config\.[a-z]+|playwright[^/]*\.config\.[a-z]+|vitest[^/]*\.[a-z]+|vite\.config\.[a-z]+|\.dependency-cruiser\.cjs)$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /^\.claude(\/|$)/,
  /^\.github(\/|$)/,
  /(^|\/)(user\.properties|\.env[^/]*|id_[a-z0-9]+|[^/]*\.(pem|key|p12))$/i,
  /(^|\/)(credentials|secrets?)[^/]*$/i,
];

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
}
/** First layer: only tests/e2e and src may change (the denylist above is the second layer). Everything else (.npmrc, .pnpmfile.cjs, public/, visual baselines...) is rejected. */
const ALLOWED: readonly RegExp[] = [/^tests\/e2e\//, /^src\//];
export function isForbiddenPath(p: string): boolean {
  const n = normalizePath(p);
  return n.startsWith('/') || n.split('/').includes('..') || !ALLOWED.some((re) => re.test(n)) || FORBIDDEN.some((re) => re.test(n));
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

/** Paths from a `-z` name list (`git diff --name-only -z`, `git ls-files -z`). */
export const parseNulList = (out: string): string[] => out.split('\0').filter(Boolean);

/** Added lines of a unified diff that switch a test off, focus it, expect it to fail, or add retries (that would fake a green). */
const WEAKEN = /\.(skip|fixme|only|fails|todo)\s*\(|\b(xit|xdescribe|xtest)\s*\(|\btest\.fail\b|\btest\.describe\.configure\b|\bretries\b/;
const EXPECT = /\bexpect(\.soft|\.poll)?\s*\(/;
export function addsSkipMarkers(diff: string): string[] {
  const lines = diff.split('\n');
  const added = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  const out = added.filter((l) => WEAKEN.test(l)).map((l) => l.slice(1).trim().slice(0, 120));
  const removedExpect = lines.filter((l) => l.startsWith('-') && !l.startsWith('---') && EXPECT.test(l)).length;
  if (removedExpect > 0 && !added.some((l) => EXPECT.test(l))) out.push(`removes ${String(removedExpect)} expect( line(s) and adds none`);
  return out;
}

// ---- when and how often ----
export const shouldRun = (s: NightlyStatus | undefined): boolean => s?.state === 'red' && s.unrecorded.length > 0;
/** A status is usable when it is not stale and (for collect-and-fix) was finished by this run's collect. */
export function statusUsable(s: NightlyStatus, nowMs: number, notBefore?: string): boolean {
  if (isStale(s, nowMs)) return false;
  return notBefore === undefined || Date.parse(s.finishedAt) >= Date.parse(notBefore);
}
/** Hard stop for a run that began at `start`: 07:00 same morning for a night run, 22:00 for a daytime run (keeps the PC free for the 23:00 full run), none left for a run that starts at or after 22:00. */
export function deadlineFor(start: Date): Date {
  const d = new Date(start);
  if (start.getHours() < MORNING_STOP_HOUR) d.setHours(MORNING_STOP_HOUR, 0, 0, 0);
  else if (start.getHours() < STOP_HOUR) d.setHours(STOP_HOUR, 0, 0, 0);
  return d;
}
export const deadlineReached = (startMs: number, now: Date): boolean => now.getTime() - startMs >= MAX_RUN_MS || now.getTime() >= deadlineFor(new Date(startMs)).getTime();
const left = (now: Date, startMs: number): number => deadlineFor(new Date(startMs)).getTime() - now.getTime();
export const canStartRound = (startMs: number, now: Date): boolean => left(now, startMs) >= MIN_ROUND_MS;
/** The full run plus the gate:push that follows it must both fit before the deadline. */
export const canStartFullRun = (startMs: number, now: Date): boolean => left(now, startMs) >= FULL_RUN_MS + GATE_PUSH_ESTIMATE_MS;
/** A child timeout never runs past the deadline (so nothing is left running after 07:00). */
export const capTimeout = (ms: number, startMs: number, now: Date): number => Math.max(1000, Math.min(ms, left(now, startMs)));

/** Collect found the 23:00 run unfinished (still pending, or the PC busy/unreachable): wait and retry instead of skipping the night. */
export const collectUnfinished = (s: NightlyStatus | undefined): boolean => s?.state === 'pending' || (s?.state === 'not-run' && s.exit !== null && RETRY_EXITS.includes(s.exit));
/** Retry only while the next try still starts by min(04:30 of the night the run began, a round's length before the hard stop). */
export function retryAllowed(s: NightlyStatus | undefined, start: Date, now: Date): boolean {
  const cutoff = new Date(start);
  cutoff.setHours(RETRY_CUTOFF.hour, RETRY_CUTOFF.minute, 0, 0);
  if (start.getHours() >= MORNING_STOP_HOUR) cutoff.setDate(cutoff.getDate() + 1);
  const limit = Math.min(cutoff.getTime(), deadlineFor(start).getTime() - MIN_ROUND_MS);
  return collectUnfinished(s) && now.getTime() + RETRY_WAIT_MS <= limit;
}

const sameSpec = (a: string, b: string): boolean => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
const sameRef = (a: TestRef, b: TestRef): boolean => sameSpec(a.file, b.file) && a.title === b.title;
export interface FullRunVerdict {
  /** Unrecorded reds that were not red in the nightly before the fix: caused by the fix (collateral), block the push. */
  readonly newReds: TestRef[];
  /** Unrecorded reds that were already red in the nightly: still-open failures, never block the push. */
  readonly remaining: TestRef[];
}
/** Judge a full re-run: flaky (passed on retry) and known-red never count; a red absent from the pre-fix nightly is new. */
export function judgeFullRun(r: Results, baseline: readonly TestRef[], known: readonly KnownRed[]): FullRunVerdict {
  const reds = unrecordedFailures(r.failed, known);
  return { newReds: reds.filter((t) => !baseline.some((b) => sameRef(b, t))), remaining: reds.filter((t) => baseline.some((b) => sameRef(b, t))) };
}
/** Why a full re-run cannot be trusted ('' = complete): fewer specs than the pre-fix nightly, an interrupted run, or more skipped tests than before. */
export function fullRunIncomplete(post: unknown, r: Results, pre: unknown): string {
  const stats = (j: unknown): { skipped: number; interrupted: number } => {
    const s = ((j ?? {}) as { stats?: { skipped?: unknown; interrupted?: unknown } }).stats ?? {};
    return { skipped: typeof s.skipped === 'number' ? s.skipped : 0, interrupted: typeof s.interrupted === 'number' ? s.interrupted : 0 };
  };
  const p = parseResults(pre);
  const before = p.passed + p.failed.length + p.flaky.length;
  const after = r.passed + r.failed.length + r.flaky.length;
  if (after < before) return `${String(after)} specs ran, the pre-fix nightly had ${String(before)}`;
  if (stats(post).interrupted > 0) return 'the run was interrupted';
  if (stats(post).skipped > stats(pre).skipped) return `skipped tests rose from ${String(stats(pre).skipped)} to ${String(stats(post).skipped)}`;
  return '';
}
/** Next fix cycle chases only a red whose earlier fix did not hold (outcome fixed): flaky, known-red, needs-human and unfixed specs are never chased. */
export function retargets(v: FullRunVerdict, results: readonly FailureResult[]): TestRef[] {
  return v.remaining.filter((t) => results.some((r) => r.outcome === 'fixed' && sameRef(r, t)));
}

// ---- classify before fixing: dedupe, retry once, tier ----
export type RedClass = 'flaky-on-retry' | 'real' | 'p2-record' | 'unclassified';
export interface ClassifiedRed extends TestRef {
  readonly tier: Tier;
  readonly cls: RedClass;
  readonly reason: string;
}
/** The one retry of the unrecorded reds on the PC: it ran (Playwright JSON of the retry), or the router stopped (89/94/95/96, signal, timeout, no results). */
export type RetryOutcome = { readonly kind: 'ran'; readonly json: unknown } | { readonly kind: 'stopped'; readonly reason: string };
const refKey = (t: TestRef): string => `${t.file.split('/').pop() ?? t.file}\0${t.title}`;
/** One entry per file+title (the same test under several viewport projects is one red). */
export function dedupeRefs<T extends TestRef>(refs: readonly T[]): T[] {
  const seen = new Set<string>();
  return refs.filter((t) => !seen.has(refKey(t)) && !!seen.add(refKey(t)));
}
/** Per distinct red: passed on the retry -> flaky-on-retry; failed -> real (P0/P1) or p2-record (P2, report only); retry did not run -> unclassified (blocks like real). */
export function classifyReds(reds: readonly TestRef[], retry: RetryOutcome, tierFor: (t: TestRef) => Tier): ClassifiedRed[] {
  return dedupeRefs(reds).map((t) => {
    const tier = tierFor(t);
    const ref = { file: t.file, title: t.title, tier };
    if (retry.kind === 'stopped') return { ...ref, cls: 'unclassified', reason: `not classified, treated as real: ${retry.reason}` };
    if (titlePassed(retry.json, t)) return { ...ref, cls: 'flaky-on-retry', reason: 'passed on the one retry (candidate known-red; log in the flake ledger)' };
    return tier === 'P2' ? { ...ref, cls: 'p2-record', reason: 'P2 red, failed on retry: recorded, never blocks (propose a known-red entry)' } : { ...ref, cls: 'real', reason: `${tier} red, failed on retry` };
  });
}
export const blockingReds = (c: readonly ClassifiedRed[]): ClassifiedRed[] => c.filter((r) => r.cls === 'real' || r.cls === 'unclassified');
/** clean-push: nothing blocks (WP1 push); broken-night: more than MAX_REAL_REDS blocking reds (needs-human, no rounds); else fix the blocking reds only. */
export function redsVerdict(c: readonly ClassifiedRed[]): 'clean-push' | 'fix' | 'broken-night' {
  const n = blockingReds(c).length;
  return n === 0 ? 'clean-push' : n > MAX_REAL_REDS ? 'broken-night' : 'fix';
}
/** Proposed known-red.json entry text for a flaky or P2 red (the report lists it; a human or the coordinator records it). */
export const knownRedProposal = (c: ClassifiedRed, firstSeen: string): string =>
  JSON.stringify({ file: specPath(c.file), titleIncludes: c.title, tier: c.tier, firstSeen, idea: '<ideas/brainstorm/...md>', status: 'open' });

export interface ChildResult {
  readonly code: number;
  readonly signal?: string | undefined;
  readonly timedOut?: boolean | undefined;
}
/** Any non-zero exit, signal or timeout. */
export const childFailed = (r: ChildResult): boolean => r.code !== 0 || !!r.signal || !!r.timedOut;
/** Router re-run: a signal, a timeout or an exit other than 0/1 stops the whole loop and is never retried. */
export const rerunStops = (r: ChildResult): boolean => !!r.signal || !!r.timedOut || stopsLoop(r.code);

/** Green means the title really passed: every test of the spec ended `expected` with a `passed` result (not skipped). */
export function titlePassed(json: unknown, ref: TestRef): boolean {
  let seen = false;
  let ok = true;
  const same = (a: string, b: string): boolean => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
  const walk = (n: { file?: string; specs?: { title?: string; file?: string; tests?: { status?: string; results?: { status?: string }[] }[] }[]; suites?: unknown[] }, file: string): void => {
    const f = n.file ?? file;
    for (const sp of n.specs ?? []) {
      if (sp.title !== ref.title || !same(sp.file ?? f, ref.file)) continue;
      seen = true;
      const tests = sp.tests ?? [];
      if (tests.length === 0) ok = false;
      for (const t of tests) {
        const last = (t.results ?? [])[(t.results ?? []).length - 1];
        if (t.status !== 'expected' || last?.status !== 'passed') ok = false;
      }
    }
    for (const c of n.suites ?? []) walk(c as typeof n, f);
  };
  for (const s of ((json ?? {}) as { suites?: unknown[] }).suites ?? []) walk(s as Parameters<typeof walk>[0], '');
  return seen && ok;
}
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
/** Error text goes into the prompt and the report: no ANSI, no hosts or home paths (redact), no absolute paths. */
export function scrub(s: string): string {
  return redact(s.replace(ANSI, ''))
    .replace(/(?<![\w.:/~-])\/(?:[\w.@+-]+\/)+[\w.@+-]*/g, '<path>')
    .replace(/(?<![\w])[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]*/g, '<path>');
}

export function extractFailures(json: unknown, wanted: readonly TestRef[]): Failure[] {
  const found = new Map<string, Failure>();
  const walk = (n: PwNode, file: string): void => {
    const f = n.file ?? file;
    for (const sp of n.specs ?? []) {
      const res = (sp.tests ?? []).flatMap((t) => t.results ?? []).filter((r) => r.status === 'failed' || r.status === 'timedOut');
      const last = res[res.length - 1];
      if (!last) continue;
      const msg = scrub(last.errors?.[0]?.message ?? last.error?.message ?? '').slice(0, 1500);
      const trace = (last.attachments?.find((a) => a.name === 'trace')?.path ?? '').split(/[\\/]/).pop() ?? '';
      found.set(`${sp.file ?? f}\0${sp.title ?? ''}`, { file: sp.file ?? f, title: sp.title ?? '', message: msg, tracePath: trace });
    }
    for (const c of n.suites ?? []) walk(c, f);
  };
  for (const s of ((json ?? {}) as { suites?: PwNode[] }).suites ?? []) walk(s, s.file ?? '');
  return wanted.map((w) => found.get(`${w.file}\0${w.title}`) ?? { ...w, message: '(no error text in the collected results)', tracePath: '' });
}

// ---- the headless claude call ----
// Sandbox: the repo's .claude/settings.json allows Bash(*) and user settings load by default, so an allowlist alone is not a fence.
// Load no user or project settings, no MCP, no hooks (--safe-mode), and give the model only file tools (no Bash at all: the harness
// runs lint, tests and the re-run). Spend is capped.
export const TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep'];
export const DENIED_TOOLS = ['Bash', 'WebFetch', 'WebSearch', 'Task'];
export const MAX_BUDGET_USD = '5';
export const DENY_RULES = ['Edit(node_modules/**)', 'Write(node_modules/**)', 'Edit(.claude/**)', 'Write(.claude/**)', 'Edit(.git/**)', 'Write(.git/**)'];

export function claudeArgs(prompt: string): string[] {
  return [
    '-p', prompt, '--model', 'sonnet',
    // --restricted ignores user, project AND local settings (settings.local.json is gitignored and would escape the diff checks),
    // confines the file tools to the cwd and drops the command-running tools; --settings only adds the deny rules below.
    '--restricted', '--strict-mcp-config', '--safe-mode', '--settings', JSON.stringify({ permissions: { deny: DENY_RULES } }),
    '--tools', TOOLS.join(','), '--disallowedTools', DENIED_TOOLS.join(','),
    '--permission-mode', 'acceptEdits', '--permission-prompts', 'none', '--max-turns', '40', '--max-budget-usd', MAX_BUDGET_USD, '--no-session-persistence',
  ];
}

/** Env vars that would let a run touch the Mac lanes; the nightly jobs refuse to push with any of them set. */
export const BLOCKING_ENV: readonly string[] = ['CI', 'TTE_E2E_LOCAL', 'TTE_ALLOW_MAC_E2E'];
/** The only push the nightly jobs make: plain, never forced, only HEAD to main. Shared by the fix push and the clean-night push. */
export const PUSH_ARGS: readonly string[] = ['push', 'origin', 'HEAD:main'];

const ENV_KEEP = /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LC_[A-Z]+|TERM|TMPDIR|XDG_[A-Z_]+|ANTHROPIC_[A-Z_]+|CLAUDE_CODE_OAUTH_TOKEN|NODE_OPTIONS)$/;
/** Env for the re-run and gate:push children: no credentials, pushes disabled. Only the final push gets the real env. */
export function noPushEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && !/^(SSH_AUTH_SOCK|GITHUB_TOKEN|GH_TOKEN|GIT_.*)$/.test(k)) out[k] = v;
  return { ...out, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'remote.origin.pushurl', GIT_CONFIG_VALUE_0: 'disabled:' };
}
/** Clean child env: an allowlist (no SSH_AUTH_SOCK, GITHUB_TOKEN, GIT_*), and pushes disabled for any git the child runs. */
export function claudeEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && ENV_KEEP.test(k)) out[k] = v;
  return { ...out, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'remote.origin.pushurl', GIT_CONFIG_VALUE_0: 'disabled:' };
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
    'Hard stops: never edit src/core, tests/fixtures (goldens, baselines), SIM_VERSION, tools/**, tests/repo/**, eslint/tsconfig/playwright/vitest/depcruise config, docs/REPO-MAP.md, the asset manifest, package.json, lockfiles, .claude, .github or anything credential-like. If the fix needs one of those, change nothing and answer needs-human.',
    'You have file tools only (no shell). Do not edit known-red.json or add .skip/.fixme/.only/test.fail/retries; the harness commits, runs the checks and re-runs the spec on the PC.',
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
  if (i.rerunExit === 0) return i.diffEmpty ? { outcome: 'flaky', reason: 'green on re-run with no code change (candidate known-red; the coordinator acks it)' } : { outcome: 'fixed', reason: 'green on re-run after the fix' };
  if (!roundAllowed(i.round)) return { outcome: 'unfixed', reason: `still red after ${String(MAX_ROUNDS)} rounds` };
  return { outcome: 'retry', reason: 'still red' };
}

// ---- push ----
export interface PushInput {
  readonly hasCommits: boolean;
  /** origin/main (fetched) is an ancestor of the tested sha T, so T plus the fixes is a fast-forward (T need not be on origin/main). */
  readonly shaOnOrigin: boolean;
  readonly mergeOk: boolean;
  readonly forbidden: readonly string[];
  readonly markersClean: boolean;
  readonly gatePushOk: boolean;
  /** The latest FULL run on exactly the tree being pushed finished with no new reds (flaky and known-red do not count). */
  readonly rerunGreen: boolean;
  readonly originUnmoved: boolean;
  readonly noEnvOverride: boolean;
}
/** Every reason the push must not happen; empty means push (plain `git push origin HEAD:main`, never forced). */
export function pushBlockers(i: PushInput): string[] {
  const b: string[] = [];
  if (!i.hasCommits) b.push('nothing to push');
  if (!i.noEnvOverride) b.push('CI, TTE_E2E_LOCAL or TTE_ALLOW_MAC_E2E is set');
  if (!i.shaOnOrigin) b.push('origin/main is not an ancestor of the tested commit (diverged); no fast-forward push');
  if (!i.mergeOk) b.push('merge --no-ff into main failed');
  if (i.forbidden.length) b.push(`merged diff touches forbidden paths: ${i.forbidden.join(', ')}`);
  if (!i.markersClean) b.push('conflict markers found');
  if (!i.gatePushOk) b.push('gate:push failed');
  if (!i.rerunGreen) b.push('the latest full run on the pushed tree has new reds or did not finish');
  if (!i.originUnmoved) b.push('origin/main moved during the run');
  return b;
}

export function finalState(results: readonly FailureResult[], pushed: boolean): FixState {
  if (results.some((r) => r.outcome === 'needs-human')) return 'needs-human';
  if (pushed && results.every((r) => r.outcome === 'fixed' || r.outcome === 'flaky' || r.outcome === 'p2-record')) return 'fixed-pushed';
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
  /** Local branch holding unpushed fixes, when there are any. */
  readonly keptBranch?: string;
}

const ERR_LINES = 3;
/** Last non-empty lines of an error message. */
export const errorTail = (msg: string): string[] => msg.split('\n').map((l) => l.trim()).filter(Boolean).slice(-ERR_LINES).map((l) => l.slice(0, 160));
const classOf = (r: FailureResult): string => (r.outcome === 'flaky' ? 'flaky-on-retry' : r.outcome === 'p2-record' ? 'P2' : 'real');
const cell = (t: string): string => t.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const TABLE_HEAD = ['| spec | title | tier | class | rounds | outcome | last 3 error lines |', '| --- | --- | --- | --- | --- | --- | --- |'];

/** Per distinct red: a table row each, then the exact next commands. */
export function describeFix(s: FixStatus | undefined): string[] {
  if (!s) return [];
  const out = [`nightly fix: ${s.state}${s.pushed ? ' (pushed)' : ''} for ${s.sha.slice(0, 7)} at ${s.finishedAt}`];
  if (s.results.length) {
    out.push('', ...TABLE_HEAD);
    for (const r of s.results) out.push(`| ${cell(specPath(r.file))} | ${cell(r.title)} | ${r.tier ?? '?'} | ${classOf(r)} | ${String(r.rounds)} | ${r.outcome} | ${cell((r.errorTail ?? []).join(' / ') || r.reason)} |`);
    out.push('', 'Do next:');
    const day = s.finishedAt.slice(0, 10);
    for (const r of s.results) {
      if (r.outcome === 'flaky' || r.outcome === 'p2-record')
        out.push(`  - ${r.title}: add to known-red.json: ${JSON.stringify({ file: specPath(r.file), titleIncludes: r.title, tier: r.tier ?? 'P2', firstSeen: day, idea: '<ideas/brainstorm/...md>', status: 'open' })}`);
      else if (r.outcome !== 'fixed') out.push(`  - ${r.title}: corepack pnpm e2e -- ${specPath(r.file)}`);
    }
    if (s.keptBranch) out.push(`  - fixes kept locally on branch ${s.keptBranch} (git log ${s.keptBranch})`);
  }
  for (const b of s.blockers) out.push(`  blocked: ${b}`);
  return out;
}

export interface MorningInput {
  readonly status: NightlyStatus | undefined;
  readonly fix: FixStatus | undefined;
  readonly push: PushStatus | undefined;
  readonly nowMs: number;
}
/** The one-screen morning report (report file and `nightly:status` print the same text): PUSHED/NOT PUSHED, red table, Do next, gate tail, untested-local count. */
export function morningReport(i: MorningInput): string[] {
  const { status, fix, push } = i;
  let head: string;
  if (push?.pushed) head = `PUSHED ${push.sha.slice(0, 7)} to origin/main`;
  else if (fix?.pushed) head = `PUSHED ${fix.sha.slice(0, 7)} to origin/main`;
  else {
    const why = push?.blockers[0] ?? fix?.blockers[0] ?? (fix ? `fix loop ended ${fix.state}` : status ? (status.state === 'red' ? 'red night, nothing classified yet' : `nightly e2e is ${status.state}`) : 'no nightly status recorded');
    head = `NOT PUSHED: ${why}`;
  }
  const out = [head, ...describeStatus(status, i.nowMs)];
  const f = describeFix(fix);
  if (f.length) out.push(...f);
  else if (status?.state === 'red' && status.unrecorded.length) {
    out.push('', ...TABLE_HEAD);
    for (const t of status.unrecorded) out.push(`| ${cell(specPath(t.file))} | ${cell(t.title)} | ? | unclassified | 0 | none | - |`);
    out.push('', 'Do next:', ...status.unrecorded.map((t) => `  - ${t.title}: corepack pnpm e2e -- ${specPath(t.file)}`));
  }
  const gt = push?.gateTail ?? [];
  if (gt.length) out.push('', `gate:commit red, last ${String(gt.length)} lines:`, ...gt.map((l) => `  | ${l}`));
  if (push && !push.pushed) out.push(...push.blockers.slice(1).map((b) => `  - ${b}`));
  out.push(`untested local commits on main: ${String(push?.untestedLocal ?? 0)}`);
  return out.map(redact);
}
