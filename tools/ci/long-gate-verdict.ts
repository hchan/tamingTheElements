// CI step: read tools/ci/long-gate-status.json and decide what pages-build deploys (see long-gate-status.ts).
// `tsx tools/ci/long-gate-verdict.ts [--now <iso>] [--max-age-hours 36] [--github-output]`. Env: IGNORE_LONG_GATE=true, GITHUB_SHA.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SHA_RE, verdict, type Verdict } from './long-gate-status';

export const STATUS_PATH = join(dirname(fileURLToPath(import.meta.url)), 'long-gate-status.json');

export interface CliOptions {
  readonly now: Date;
  readonly maxAgeHours: number;
  readonly githubOutput: boolean;
}

export function parseCliArgs(argv: readonly string[], clock: () => Date = () => new Date()): CliOptions {
  let now: Date | undefined;
  let maxAgeHours = 36;
  let githubOutput = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--now') {
      now = new Date(argv[++i] ?? '');
      if (Number.isNaN(now.getTime())) throw new Error('--now needs an ISO date');
    } else if (a === '--max-age-hours') {
      maxAgeHours = Number(argv[++i]);
      if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw new Error('--max-age-hours needs a positive number');
    } else if (a === '--github-output') githubOutput = true;
    else throw new Error(`Unknown argument: ${String(a)}`);
  }
  return { now: now ?? clock(), maxAgeHours, githubOutput };
}

/** Only the exact string 'true' ignores the gate; a schedule run gives ''. */
export const ignoreFlag = (env: string | undefined): boolean => env === 'true';

/** `$GITHUB_OUTPUT` lines. The reason is one line with no newlines. */
export function outputLines(v: Verdict): string[] {
  return [`deploy=${String(v.deploy)}`, `sha=${v.sha}`, `reason=${v.reason.replace(/[\r\n]+/g, ' ')}`];
}

/** The workflow-command line (`::warning::`...) for the log and annotations. */
export function annotation(v: Verdict): string {
  return `::${v.level}::${v.reason.replace(/[\r\n%]+/g, ' ')}`;
}

export function summaryMarkdown(v: Verdict): string {
  return `### Long gate verdict\n\n- deploy: **${String(v.deploy)}**\n- sha: \`${v.sha || '-'}\`\n- ${v.reason}\n`;
}

function readStatus(): unknown {
  if (!existsSync(STATUS_PATH)) return undefined;
  try {
    return JSON.parse(readFileSync(STATUS_PATH, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

function main(): void {
  const opts = parseCliArgs(process.argv.slice(2));
  const headSha = process.env.GITHUB_SHA ?? spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  if (!SHA_RE.test(headSha)) throw new Error('HEAD sha is not 40 hex characters');
  const isAncestor = (a: string, b: string): boolean => SHA_RE.test(a) && SHA_RE.test(b) && spawnSync('git', ['merge-base', '--is-ancestor', a, b]).status === 0;
  const v = verdict(readStatus(), { now: opts.now, maxAgeHours: opts.maxAgeHours, ignore: ignoreFlag(process.env.IGNORE_LONG_GATE), headSha, isAncestor });
  console.log(annotation(v));
  if (opts.githubOutput) {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, outputLines(v).join('\n') + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(v));
  }
  if (v.fail) process.exit(1);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
