// Nightly fix loop: pure logic (guardrails, prompts, triage, push preconditions, report). No fs, git, clock or claude here;
// tools/ci/nightly-fix.ts does the I/O. Tests: tests/repo/nightly-fix.test.ts. Design: ideas/in-progress/nightly-fix-loop.md.
import { isStale, type NightlyStatus, type TestRef } from './nightly-status';
import { redact } from './redact';

export const MAX_ROUNDS = 3;
export const ROUND_TIMEOUT_MS = 25 * 60_000;
export const RERUN_TIMEOUT_MS = 40 * 60_000;
export const GATE_TIMEOUT_MS = 90 * 60_000;
/** More unrecorded failures than this is a broken night, not something to fix by loop: report needs-human, no rounds. */
export const MAX_FAILURES = 3;
export const MAX_RUN_MS = 4 * 3600_000;
export const STOP_HOUR = 22;
/** Above the worst-case run (4 h of rounds plus the merge re-runs and gate:push), so a live run is never taken over. */
export const LOCK_STALE_MS = 12 * 3600_000;
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
/** 4 h wall clock from the start, and never past 22:00 local (keeps the PC free for the 23:00 full run). */
export const deadlineReached = (startMs: number, now: Date): boolean => now.getTime() - startMs >= MAX_RUN_MS || now.getHours() >= STOP_HOUR;
export const tooManyFailures = (n: number): boolean => n > MAX_FAILURES;

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
