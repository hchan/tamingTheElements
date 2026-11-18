// The nightly long gate's recorded result (tools/ci/long-gate-status.json) and the CI deploy verdict derived from it.
// Pure functions only: no fs, no git, no clock (callers inject them). See ideas/brainstorm/short-and-long-gate.md.
export const HISTORY_MAX = 14;
export const FAILING_MAX = 50;
export const SHA_RE = /^[0-9a-f]{40}$/;

export type GateResult = 'pass' | 'fail' | 'error';

export interface FailingTest {
  readonly file: string;
  readonly line: number;
  readonly title: string;
  readonly project: string;
}
export interface LastRun {
  readonly sha: string;
  readonly result: GateResult;
  readonly finishedAt: string;
  readonly runner: string;
  readonly failing: readonly FailingTest[];
  readonly flaky: readonly string[];
  readonly quarantined: readonly string[];
}
export interface HistoryEntry {
  readonly sha: string;
  readonly result: GateResult;
  readonly finishedAt: string;
  readonly failed: number;
}
export interface Status {
  readonly schema: 1;
  readonly enforce: boolean;
  readonly lastRun?: LastRun;
  readonly lastGood?: { readonly sha: string; readonly finishedAt: string };
  readonly history?: readonly HistoryEntry[];
}
/** The subset of long-gate.json that recording needs. */
export interface RunResult {
  readonly sha: string;
  readonly result: GateResult;
  readonly finishedAt: string;
  readonly runner: string;
  readonly failing?: readonly FailingTest[];
  readonly flaky?: readonly string[];
  readonly quarantined?: readonly string[];
}

export type Validation = { readonly ok: true; readonly status: Status } | { readonly ok: false; readonly error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isResult = (v: unknown): v is GateResult => v === 'pass' || v === 'fail' || v === 'error';
const isSha = (v: unknown): v is string => typeof v === 'string' && SHA_RE.test(v);
const isTime = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export function validateStatus(raw: unknown): Validation {
  const bad = (error: string): Validation => ({ ok: false, error });
  if (!isObj(raw)) return bad('status is not an object');
  if (raw.schema !== 1) return bad('schema must be 1');
  if (typeof raw.enforce !== 'boolean') return bad('enforce must be a boolean');
  const { lastRun, lastGood, history } = raw;
  if (lastRun !== undefined) {
    if (!isObj(lastRun) || !isSha(lastRun.sha) || !isResult(lastRun.result) || !isTime(lastRun.finishedAt)) return bad('lastRun is malformed');
    if (!Array.isArray(lastRun.failing) || lastRun.failing.length > FAILING_MAX) return bad(`lastRun.failing must be an array of at most ${FAILING_MAX}`);
  }
  if (lastGood !== undefined && (!isObj(lastGood) || !isSha(lastGood.sha) || !isTime(lastGood.finishedAt))) return bad('lastGood is malformed');
  if (history !== undefined) {
    if (!Array.isArray(history) || history.length > HISTORY_MAX) return bad(`history must be an array of at most ${HISTORY_MAX}`);
    for (const h of history as unknown[]) {
      if (!isObj(h) || !isSha(h.sha) || !isResult(h.result) || !isTime(h.finishedAt) || typeof h.failed !== 'number') return bad('history entry is malformed');
    }
  }
  return { ok: true, status: raw as unknown as Status };
}

/** Record one run. `lastGood` moves only on a pass and only forward (`isAncestor(old, new)`); history is newest first. */
export function applyResult(status: Status, r: RunResult, isAncestor: (older: string, newer: string) => boolean): Status {
  const failing = (r.failing ?? []).slice(0, FAILING_MAX);
  const lastRun: LastRun = {
    sha: r.sha,
    result: r.result,
    finishedAt: r.finishedAt,
    runner: r.runner,
    failing,
    flaky: r.flaky ?? [],
    quarantined: r.quarantined ?? [],
  };
  const old = status.lastGood;
  const moves = r.result === 'pass' && (old === undefined || old.sha === r.sha || isAncestor(old.sha, r.sha));
  const history = [{ sha: r.sha, result: r.result, finishedAt: r.finishedAt, failed: (r.failing ?? []).length }, ...(status.history ?? [])].slice(0, HISTORY_MAX);
  const lastGood = moves ? { sha: r.sha, finishedAt: r.finishedAt } : old;
  return { ...status, lastRun, ...(lastGood === undefined ? {} : { lastGood }), history };
}

export interface VerdictInput {
  readonly now: Date;
  readonly maxAgeHours: number;
  readonly ignore: boolean;
  readonly headSha: string;
  readonly isAncestor: (older: string, newer: string) => boolean;
}
export interface Verdict {
  readonly deploy: boolean;
  /** The commit to build and deploy; empty when deploy is false. */
  readonly sha: string;
  readonly reason: string;
  /** GitHub annotation level for the reason. */
  readonly level: 'notice' | 'warning' | 'error';
  /** True only for a red last run (enforced): the pages-build job must fail. */
  readonly fail: boolean;
}

/** What enforcement does with a status. `raw` is the parsed JSON (or undefined when the file is missing). */
function enforced(raw: unknown, v: VerdictInput): Verdict {
  const skip = (reason: string, level: Verdict['level'] = 'warning', fail = false): Verdict => ({ deploy: false, sha: '', reason, level, fail });
  const val = validateStatus(raw);
  if (!val.ok) return skip(`long gate status missing or invalid (${val.error})`);
  const s = val.status;
  const run = s.lastRun;
  if (run === undefined) return skip('long gate has not recorded a run yet');
  if (run.result === 'fail') return skip(`last long gate run failed on ${run.sha.slice(0, 7)} (${run.failing.length} failing)`, 'error', true);
  if (run.result === 'error') return skip(`last long gate run errored on ${run.sha.slice(0, 7)} (runner problem, not a test failure)`);
  const ageH = (v.now.getTime() - Date.parse(run.finishedAt)) / 3_600_000;
  if (ageH > v.maxAgeHours) return skip(`last long gate run is stale (${Math.floor(ageH)} h old, limit ${v.maxAgeHours} h)`);
  const good = s.lastGood;
  if (good === undefined) return skip('long gate passed but no lastGood is recorded');
  if (!v.isAncestor(good.sha, v.headSha)) return skip(`lastGood ${good.sha.slice(0, 7)} is not an ancestor of HEAD`, 'error');
  return { deploy: true, sha: good.sha, reason: `deploying lastGood ${good.sha.slice(0, 7)}`, level: 'notice', fail: false };
}

export function verdict(raw: unknown, v: VerdictInput): Verdict {
  if (!SHA_RE.test(v.headSha)) return { deploy: false, sha: '', reason: 'HEAD sha is not 40 hex characters', level: 'error', fail: true };
  if (v.ignore) return { deploy: true, sha: v.headSha, reason: 'ignore_long_gate is set: deploying HEAD without the long gate', level: 'warning', fail: false };
  const valid = validateStatus(raw);
  // Shadow mode: deploy exactly as before, but say what enforcement would have done.
  if (valid.ok && !valid.status.enforce) {
    const would = enforced({ ...valid.status, enforce: true }, v);
    const what = would.deploy ? `would deploy ${would.sha.slice(0, 7)}` : `would skip the deploy: ${would.reason}`;
    return { deploy: true, sha: v.headSha, reason: `shadow mode (enforce is false): deploying HEAD; enforcement ${what}`, level: 'warning', fail: false };
  }
  return enforced(raw, v);
}
