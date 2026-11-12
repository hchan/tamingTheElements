// `pnpm e2e:flake [--config <file>] [--repeat N] [--grep <re>] <spec paths...>`: runs Playwright specs N times with
// `--repeat-each` and prints a per-test pass-rate table (JSON reporter), so a flaky test shows as e.g. 4/5 instead of a
// lucky green run. Exit code is 1 if any test failed at least once. Retries are forced off so nothing is hidden.
// Use E2E_PORT (main config) to run beside other worktrees. See docs/TESTING.md ("Finding flakes").
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface PwResult {
  status: string;
}
interface PwTest {
  results: PwResult[];
}
interface PwSpec {
  title: string;
  file: string;
  tests: PwTest[];
}
interface PwSuite {
  specs?: PwSpec[];
  suites?: PwSuite[];
}
interface PwReport {
  suites: PwSuite[];
}

export interface Tally {
  readonly name: string;
  pass: number;
  fail: number;
}

export function tally(report: PwReport): Tally[] {
  const rows = new Map<string, Tally>();
  const walk = (s: PwSuite): void => {
    for (const spec of s.specs ?? []) {
      const name = `${spec.file}: ${spec.title}`;
      const row = rows.get(name) ?? { name, pass: 0, fail: 0 };
      for (const t of spec.tests) {
        for (const r of t.results) {
          if (r.status === 'passed') row.pass++;
          else if (r.status !== 'skipped') row.fail++;
        }
      }
      rows.set(name, row);
    }
    for (const c of s.suites ?? []) walk(c);
  };
  for (const s of report.suites) walk(s);
  return [...rows.values()];
}

export function formatTable(rows: readonly Tally[]): string {
  const lines = rows.map((r) => {
    const n = r.pass + r.fail;
    const pct = n === 0 ? 'n/a' : `${((100 * r.pass) / n).toFixed(0)}%`;
    return `${r.fail === 0 ? 'ok   ' : 'FLAKY'} ${String(r.pass)}/${String(n)} ${pct.padStart(4)}  ${r.name}`;
  });
  return lines.join('\n');
}

function main(): void {
  const argv = process.argv.slice(2);
  let repeat = 5;
  const pass: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '--repeat') repeat = Number(argv[++i]);
    else pass.push(a);
  }
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error('--repeat needs a positive integer');
  const dir = join(homedir(), 'claudetmp');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `e2e-flake-${String(Date.now())}.json`);
  const r = spawnSync(
    'corepack',
    ['pnpm', 'exec', 'playwright', 'test', `--repeat-each=${String(repeat)}`, '--retries=0', '--reporter=json', ...pass],
    { stdio: ['inherit', 'pipe', 'inherit'], env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: out }, maxBuffer: 1 << 28 },
  );
  let report: PwReport;
  try {
    report = JSON.parse(readFileSync(out, 'utf8')) as PwReport;
  } catch {
    process.stdout.write(r.stdout);
    throw new Error('no JSON report produced (build or config error above)');
  }
  const rows = tally(report);
  process.stdout.write(`${formatTable(rows)}\n(${String(repeat)} repeats each; raw report: ${out})\n`);
  process.exit(rows.some((x) => x.fail > 0) || r.status !== 0 ? 1 : 0);
}

if (process.argv[1]?.endsWith('e2e-flake.ts')) main();
