// `pnpm ci:local [--fast]`: runs what .github/workflows/ci.yml runs, locally, so no Actions minutes are needed.
// Prints a summary table and exits non-zero on any failure. See docs/TESTING.md.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export interface Options {
  readonly fast: boolean;
}

export interface Step {
  readonly name: string;
  readonly args: readonly string[];
}

export type Status = 'pass' | 'fail' | 'skip';
export interface Result {
  readonly name: string;
  readonly status: Status;
  readonly seconds: number;
  readonly note: string;
}

export function parseCliArgs(argv: readonly string[]): Options {
  let fast = false;
  for (const a of argv) {
    if (a === '--fast') fast = true;
    else throw new Error(`Unknown argument: ${a} (usage: ci:local [--fast])`);
  }
  return { fast };
}

/** The same order and commands as the `check` and `e2e` jobs in ci.yml. */
export const CORE_STEPS: readonly Step[] = ['lint', 'typecheck', 'depcruise', 'test', 'test:legacy', 'build', 'size:check'].map((s) => ({
  name: s,
  args: [s],
}));
export const E2E_STEPS: readonly Step[] = ['e2e', 'e2e:pages'].map((s) => ({ name: s, args: [s] }));
export const ENGINES = ['chromium', 'firefox', 'webkit'] as const;

export function browserStep(engine: string): Step {
  return { name: `test:browser (${engine})`, args: ['test:browser', `--browser.name=${engine}`] };
}

export function planSteps(opts: Options, launchable: ReadonlySet<string> = new Set()): { run: Step[]; skipped: Result[] } {
  const run: Step[] = [...CORE_STEPS];
  const skipped: Result[] = [];
  if (opts.fast) {
    for (const n of ['e2e', 'e2e:pages', 'test:browser']) {
      skipped.push({ name: n, status: 'skip', seconds: 0, note: '--fast (no browsers)' });
    }
    return { run, skipped };
  }
  run.push(...E2E_STEPS);
  for (const engine of ENGINES) {
    if (launchable.has(engine)) run.push(browserStep(engine));
    else skipped.push({ name: `test:browser (${engine})`, status: 'skip', seconds: 0, note: `${engine} cannot launch here; CI covers it` });
  }
  return { run, skipped };
}

export function formatSummary(results: readonly Result[]): string {
  const w = Math.max(4, ...results.map((r) => r.name.length));
  const lines = [`${'step'.padEnd(w)}  status  time    note`];
  for (const r of results) {
    lines.push(`${r.name.padEnd(w)}  ${r.status.toUpperCase().padEnd(6)}  ${`${r.seconds.toFixed(1)}s`.padEnd(6)}  ${r.note}`);
  }
  return lines.join('\n');
}

export const exitCodeFor = (results: readonly Result[]): number => (results.some((r) => r.status === 'fail') ? 1 : 0);

async function probeEngines(): Promise<{ ok: Set<string>; notes: Map<string, string> }> {
  const ok = new Set<string>();
  const notes = new Map<string, string>();
  const pw = await import('playwright');
  for (const e of ENGINES) {
    try {
      const b = await pw[e].launch({ headless: true, timeout: 30_000 });
      await b.close();
      ok.add(e);
    } catch (err) {
      notes.set(e, (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? 'launch failed');
    }
  }
  return { ok, notes };
}

async function main(): Promise<number> {
  const opts = parseCliArgs(process.argv.slice(2));
  let launchable = new Set<string>();
  const notes = new Map<string, string>();
  if (!opts.fast) {
    const p = await probeEngines();
    launchable = p.ok;
    for (const [e, n] of p.notes) {
      notes.set(e, n);
      console.warn(`ci:local: SKIPPING ${e} determinism run: cannot launch (${n}). Try \`pnpm exec playwright install ${e}\`.`);
    }
    if (!launchable.has('chromium')) console.warn('ci:local: chromium cannot launch; the e2e steps will fail.');
  }
  const { run, skipped } = planSteps(opts, launchable);
  const results: Result[] = [];
  for (const step of run) {
    console.log(`\n=== ${step.name} ===`);
    const t0 = Date.now();
    const r = spawnSync('corepack', ['pnpm', ...step.args], { stdio: 'inherit' });
    const seconds = (Date.now() - t0) / 1000;
    const status: Status = r.status === 0 ? 'pass' : 'fail';
    results.push({ name: step.name, status, seconds, note: status === 'fail' ? `exit ${String(r.status ?? r.signal ?? 'unknown')}` : '' });
  }
  const all = [...results, ...skipped.map((s) => ({ ...s, note: notes.get(s.name.replace(/^.*\((.*)\)$/, '$1')) ?? s.note }))];
  console.log(`\n${formatSummary(all)}`);
  const code = exitCodeFor(all);
  console.log(code === 0 ? '\nci:local: PASSED' : '\nci:local: FAILED');
  return code;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (c) => process.exit(c),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    },
  );
}
