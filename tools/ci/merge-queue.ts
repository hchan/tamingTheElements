/**
 * `pnpm merge:queue [--cleanup] [--timeout <sec>] <branch> "<subject>"`: the coordinator's serial merge. Waits while a gate
 * runs on main, `git merge --no-ff`, auto-resolves only additive conflicts in docs/REPO-MAP.md and src/core/index.ts (both
 * sides appended: keep both), aborts on any other conflict, greps for conflict markers, then runs `pnpm gate:fast`.
 * Never pushes; removes the worktree/branch only with `--cleanup`. Pure helpers are tested by tests/repo/merge-queue.test.ts.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

export const TRAILER = `Co-Authored-By: Claude Sonnet 5.5 <noreply${'@'}anthropic.com>`;
export const ADDITIVE_FILES = ['docs/REPO-MAP.md', 'src/core/index.ts'];

/** True when `pgrep -fl` output shows a gate.ts run that is not in a worktree (those do not hold main). */
export function gateOnMain(pgrepOut: string): boolean {
  return pgrepOut.split('\n').some((l) => l.includes('tools/ci/gate.ts') && !l.includes('worktrees') && !/pgrep/.test(l));
}

export function mergeMessage(subject: string): string {
  return `Merge ${subject}\n\n${TRAILER}`;
}

/**
 * Resolve diff3-style conflicts keeping both sides, only when each is additive (both sides start with the base part of the
 * hunk, which may be empty). Returns the resolved text, or undefined when any hunk is not additive or markers are malformed.
 */
export function resolveAdditive(text: string): string | undefined {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i] as string;
    if (!l.startsWith('<<<<<<< ')) {
      out.push(l);
      i++;
      continue;
    }
    const ours: string[] = [];
    const base: string[] = [];
    const theirs: string[] = [];
    let part = ours;
    let hasBase = false;
    let closed = false;
    for (i++; i < lines.length; i++) {
      const c = lines[i] as string;
      if (c.startsWith('||||||| ')) {
        part = base;
        hasBase = true;
      } else if (c === '=======') part = theirs;
      else if (c.startsWith('>>>>>>> ')) {
        closed = true;
        i++;
        break;
      } else part.push(c);
    }
    if (!closed || !hasBase) return undefined;
    const startsWithBase = (s: string[]): boolean => base.every((b, k) => s[k] === b);
    if (!startsWithBase(ours) || !startsWithBase(theirs)) return undefined;
    out.push(...base, ...ours.slice(base.length), ...theirs.slice(base.length));
  }
  return out.join('\n');
}

/** Split conflicted paths into those we may auto-resolve and those that force an abort. */
export function classifyConflicts(files: readonly string[]): { auto: string[]; hard: string[] } {
  return { auto: files.filter((f) => ADDITIVE_FILES.includes(f)), hard: files.filter((f) => !ADDITIVE_FILES.includes(f)) };
}

export interface Args {
  branch: string;
  subject: string;
  cleanup: boolean;
  timeoutSec: number;
}
export function parseArgs(argv: readonly string[]): Args | undefined {
  const pos: string[] = [];
  let cleanup = false;
  let timeoutSec = 1800;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '--cleanup') cleanup = true;
    else if (a === '--timeout') timeoutSec = Number(argv[++i]);
    else pos.push(a);
  }
  if (pos.length !== 2 || !Number.isFinite(timeoutSec)) return undefined;
  return { branch: pos[0] as string, subject: pos[1] as string, cleanup, timeoutSec };
}

const git = (args: string[]): string => execFileSync('git', args, { encoding: 'utf8' });
const pgrep = (): string => spawnSync('pgrep', ['-fl', 'tools/ci/gate.ts'], { encoding: 'utf8' }).stdout ?? '';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error('usage: pnpm merge:queue [--cleanup] [--timeout <sec>] <branch> "<subject>"');
    return 2;
  }
  const t0 = Date.now();
  while (gateOnMain(pgrep())) {
    if (Date.now() - t0 > args.timeoutSec * 1000) {
      console.error('merge:queue: a gate holds main; timed out');
      return 3;
    }
    await sleep(15000);
  }
  const m = spawnSync('git', ['-c', 'merge.conflictstyle=diff3', 'merge', '--no-ff', args.branch, '-m', mergeMessage(args.subject)], { encoding: 'utf8' });
  if (m.status !== 0) {
    const files = git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
    const { auto, hard } = classifyConflicts(files);
    const resolved = hard.length === 0 ? auto.map((f) => ({ f, t: resolveAdditive(readFileSync(f, 'utf8')) })) : [];
    if (hard.length || files.length === 0 || resolved.some((r) => r.t === undefined)) {
      spawnSync('git', ['merge', '--abort']);
      console.error(`merge:queue: merge aborted; conflicts in: ${files.join(', ') || '(none listed)'}\n${m.stderr}`);
      return 4;
    }
    for (const r of resolved) {
      writeFileSync(r.f, r.t as string);
      git(['add', r.f]);
    }
    git(['commit', '--no-edit']);
    console.log(`merge:queue: auto-resolved additive conflicts in ${auto.join(', ')}`);
  }
  const markers = spawnSync('git', ['grep', '-nE', '^(<<<<<<<|>>>>>>>) '], { encoding: 'utf8' });
  if (markers.status === 0) {
    console.error(`merge:queue: conflict markers found:\n${markers.stdout}`);
    return 5;
  }
  const g = spawnSync('corepack', ['pnpm', 'gate:fast'], { stdio: 'inherit' });
  console.log(`merge:queue: merged ${args.branch}; gate:fast ${g.status === 0 ? 'pass' : 'FAIL'}; not pushed`);
  if (g.status === 0 && args.cleanup) {
    const wt = git(['worktree', 'list', '--porcelain']).split('\n\n').find((b) => b.includes(`branch refs/heads/${args.branch}`));
    const path = wt?.match(/^worktree (.+)$/m)?.[1];
    if (path) spawnSync('git', ['worktree', 'remove', path]);
    spawnSync('git', ['branch', '-d', args.branch]);
  }
  return g.status === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith('merge-queue.ts')) void main().then((c) => process.exit(c));
