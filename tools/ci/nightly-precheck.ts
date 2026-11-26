/**
 * 23:00 precheck: after the full e2e is queued, `nightly-e2e.ts submit` runs `gate:commit` on the tip sha it checked out in the
 * detached worktree (credentials stripped, pushes disabled, same caps as the 02:00 push), so a red gate is known at 23:00 and not
 * first at 02:00. Report: tte-gate/nightly-precheck.json, shown by `pnpm nightly:status`. It never changes the submit exit code.
 * Pure logic and file helpers only; the runner lives in nightly-e2e.ts. Tests: tests/repo/nightly-e2e-cli.test.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Lines of a failed gate:commit kept in the precheck status. */
export const PRECHECK_TAIL_LINES = 30;
/** Cap for the precheck gate (the same as the 02:00 push gate, GATE_TIMEOUT_MS). */
export const PRECHECK_TIMEOUT_MS = 90 * 60_000;

export interface PrecheckStatus {
  readonly schema: 1;
  readonly sha: string;
  readonly pass: boolean;
  readonly finishedAt: string;
  /** Last lines of the gate output, only when it failed. */
  readonly tail?: readonly string[];
}

export const precheckPath = (dir: string): string => join(dir, 'nightly-precheck.json');

export function tailLines(r: { stdout: string; stderr: string }, n = PRECHECK_TAIL_LINES): string[] {
  return `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => l.trim() !== '').slice(-n);
}

export function makePrecheck(sha: string, pass: boolean, finishedAt: string, out?: { stdout: string; stderr: string }): PrecheckStatus {
  return { schema: 1, sha, pass, finishedAt, ...(!pass && out ? { tail: tailLines(out) } : {}) };
}

export function writePrecheck(dir: string, s: PrecheckStatus): void {
  writeFileSync(precheckPath(dir), `${JSON.stringify(s, null, 2)}\n`);
}

export function readPrecheck(dir: string): PrecheckStatus | undefined {
  try {
    const v = JSON.parse(readFileSync(precheckPath(dir), 'utf8')) as Partial<PrecheckStatus>;
    return v.schema === 1 && typeof v.sha === 'string' && typeof v.pass === 'boolean' && typeof v.finishedAt === 'string' ? (v as PrecheckStatus) : undefined;
  } catch {
    return undefined;
  }
}

export function describePrecheck(s: PrecheckStatus | undefined): string[] {
  if (!s) return [];
  const head = `precheck gate:commit at ${s.sha.slice(0, 7)}: ${s.pass ? 'pass' : 'FAIL'}`;
  const tail = s.pass ? [] : (s.tail ?? []).map((l) => `  | ${l}`);
  return [head, ...tail];
}
