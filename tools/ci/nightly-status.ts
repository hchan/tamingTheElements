// Nightly full e2e on the PC: the recorded status and its pure logic. No fs, no git, no clock (callers inject them).
// The status file lives in `<git common dir>/tte-gate/nightly-status.json`; see tools/ci/nightly-e2e.ts and docs/TESTING.md.
export const STALE_HOURS = 36;
export const HISTORY_MAX = 60;
export const SHA_RE = /^[0-9a-f]{40}$/;

export type NightlyState = 'pass' | 'red' | 'not-run' | 'pending';

export interface TestRef {
  readonly file: string;
  readonly title: string;
}
export interface NightlyStatus {
  readonly schema: 1;
  readonly state: NightlyState;
  readonly sha: string;
  readonly rawId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly exit: number | null;
  readonly ranOn: string;
  readonly failed: readonly TestRef[];
  readonly flaky: readonly TestRef[];
  readonly unrecorded: readonly TestRef[];
  readonly reason: string;
}
export interface KnownRed {
  readonly file: string;
  readonly titleIncludes: string;
}
export interface Results {
  readonly passed: number;
  readonly failed: readonly TestRef[];
  readonly flaky: readonly TestRef[];
}

interface PwTest {
  status?: string;
}
interface PwSpec {
  title?: string;
  file?: string;
  tests?: PwTest[];
}
interface PwSuite {
  title?: string;
  file?: string;
  specs?: PwSpec[];
  suites?: PwSuite[];
}

/** Playwright `--reporter=json` output -> failed and flaky tests (by file + title) and a pass count. */
export function parseResults(json: unknown): Results {
  const failed: TestRef[] = [];
  const flaky: TestRef[] = [];
  let passed = 0;
  const walk = (s: PwSuite, file: string): void => {
    const f = s.file ?? file;
    for (const spec of Array.isArray(s.specs) ? s.specs : []) {
      const ref = { file: spec.file ?? f, title: spec.title ?? '' };
      const statuses = (spec.tests ?? []).map((t) => t.status);
      if (statuses.includes('unexpected')) failed.push(ref);
      else if (statuses.includes('flaky')) flaky.push(ref);
      else if (statuses.includes('expected')) passed++;
    }
    for (const c of Array.isArray(s.suites) ? s.suites : []) walk(c, f);
  };
  const root = (json ?? {}) as PwSuite;
  for (const s of Array.isArray(root.suites) ? root.suites : []) walk(s, s.file ?? '');
  return { passed, failed, flaky };
}

/** Failed tests not covered by a known-red entry (same file, title contains the entry's substring). */
export function unrecordedFailures(failed: readonly TestRef[], known: readonly KnownRed[]): TestRef[] {
  return failed.filter((t) => !known.some((k) => t.file === k.file && t.title.includes(k.titleIncludes)));
}

/** Map a router exit code to a state. Only a completed run with results can be pass or red; everything else is not-run. */
export function stateFromExit(code: number, hasResults: boolean): NightlyState {
  if (code === 0 && hasResults) return 'pass';
  if (code === 1 && hasResults) return 'red';
  return 'not-run';
}

/** Why a router exit code means "nothing learned" (94 unreachable, 95 busy, 97 not set up, 93 lost, 130 cancelled, 89 mac-only). */
export function exitReason(code: number): string {
  const m: Record<number, string> = {
    89: 'run was not routed to the PC',
    93: 'PC job lost',
    94: 'PC unreachable',
    95: 'PC busy',
    96: 'PC refused the job',
    97: 'PC not set up',
    130: 'cancelled',
  };
  return m[code] ?? (code === 0 || code === 1 ? 'no results.json' : `router exit ${String(code)}`);
}

/** The first `raw-<id>` token in router output (stderr says `queued raw-... in cpu-full`). */
export function parseRawId(text: string): string | undefined {
  return /\braw-[A-Za-z0-9][\w-]*/.exec(text)?.[0];
}

export function isStale(s: NightlyStatus, nowMs: number, maxHours = STALE_HOURS): boolean {
  const t = Date.parse(s.finishedAt || s.startedAt);
  return !Number.isFinite(t) || nowMs - t > maxHours * 3600_000;
}

/** Validate a parsed status file; undefined when missing or corrupt (callers treat that as not-run, never as pass). */
export function validateStatus(v: unknown): NightlyStatus | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Record<string, unknown>;
  const states: unknown[] = ['pass', 'red', 'not-run', 'pending'];
  const refs = (x: unknown): TestRef[] | undefined =>
    Array.isArray(x) && x.every((r) => typeof r === 'object' && r !== null && typeof (r as TestRef).file === 'string' && typeof (r as TestRef).title === 'string') ? (x as TestRef[]) : undefined;
  const failed = refs(o['failed']);
  const flaky = refs(o['flaky']);
  const unrecorded = refs(o['unrecorded']);
  if (o['schema'] !== 1 || !states.includes(o['state']) || !failed || !flaky || !unrecorded) return undefined;
  if (typeof o['sha'] !== 'string' || typeof o['rawId'] !== 'string' || typeof o['startedAt'] !== 'string' || typeof o['finishedAt'] !== 'string') return undefined;
  if (typeof o['ranOn'] !== 'string' || typeof o['reason'] !== 'string') return undefined;
  if (o['exit'] !== null && typeof o['exit'] !== 'number') return undefined;
  return o as unknown as NightlyStatus;
}

export function pendingStatus(sha: string, rawId: string, startedAt: string): NightlyStatus {
  return { schema: 1, state: 'pending', sha, rawId, startedAt, finishedAt: '', exit: null, ranOn: '', failed: [], flaky: [], unrecorded: [], reason: 'submitted, not collected yet' };
}

export function notRunStatus(sha: string, startedAt: string, finishedAt: string, exit: number | null, reason: string, rawId = ''): NightlyStatus {
  return { schema: 1, state: 'not-run', sha, rawId, startedAt, finishedAt, exit, ranOn: '', failed: [], flaky: [], unrecorded: [], reason };
}

/** Status after collecting a finished job. */
export function finishStatus(prev: NightlyStatus, exit: number, results: Results | undefined, known: readonly KnownRed[], finishedAt: string, ranOn: string): NightlyStatus {
  const base = { ...prev, finishedAt, exit, ranOn };
  if (!results) return { ...base, state: 'not-run', failed: [], flaky: [], unrecorded: [], reason: exitReason(exit) };
  const unrecorded = unrecordedFailures(results.failed, known);
  const state = stateFromExit(exit, true);
  const reason = state === 'pass' ? '' : state === 'red' ? `${String(results.failed.length)} failed` : exitReason(exit);
  return { ...base, state, failed: results.failed, flaky: results.flaky, unrecorded, reason };
}

/** Human lines for status output and later banners. Stale or not-run only warn (owner decision). */
export function describeStatus(s: NightlyStatus | undefined, nowMs: number): string[] {
  if (!s) return ['nightly e2e: no status recorded (not-run); run `pnpm nightly:submit` or install the schedule (`pnpm nightly:install`)'];
  const short = s.sha.slice(0, 7);
  const out: string[] = [];
  if (s.state === 'pending') out.push(`nightly e2e: pending for ${short} (job ${s.rawId}); \`pnpm nightly:collect\` fetches it`);
  else if (s.state === 'pass') out.push(`nightly e2e: pass at ${short} (${s.finishedAt})`);
  else if (s.state === 'red') {
    out.push(`nightly e2e: RED at ${short}: ${String(s.failed.length)} failed, ${String(s.unrecorded.length)} not recorded as known-red`);
    for (const t of s.failed) out.push(`  ${t.file}: ${t.title}`);
  } else out.push(`nightly e2e: not-run (${s.reason}) for ${short}`);
  if (s.flaky.length) out.push(`  ${String(s.flaky.length)} flaky`);
  if (s.state !== 'pending' && isStale(s, nowMs)) out.push(`nightly e2e: STALE, older than ${String(STALE_HOURS)} h; treat as not-run (warning only)`);
  return out;
}

/** Newest-last history, trimmed to HISTORY_MAX lines. */
export function appendHistory(lines: readonly string[], s: NightlyStatus): string[] {
  return [...lines, JSON.stringify(s)].slice(-HISTORY_MAX);
}
