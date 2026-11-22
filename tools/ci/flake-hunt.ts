// `pnpm flake:hunt [--budget-min N] [--repeat N] [--dry-run]`: picks a slice of e2e specs from the flake ledger (specs never run
// first, then lowest pass rate, then slowest p90) and runs it through the router (`pnpm e2e:flake`, PC only), then merges the
// summary into tools/ci/flake-ledger.json. Refuses CI=1, TTE_E2E_LOCAL and a missing PC remote. --dry-run prints and runs nothing.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { LEDGER_PATH, rollUp, type Ledger, type SpecStat } from './flake-ledger';

export const DEFAULT_SPEC_MS = 60_000;
const ROUTER_SUMMARY = '.scratch/pc-flake-summary.json';

/** Orders specs: never run first (input order), then lowest pass rate, then slowest p90, then name. */
export function rank(allSpecs: readonly string[], stats: readonly SpecStat[]): string[] {
  const by = new Map(stats.map((s) => [s.spec, s]));
  const never = allSpecs.filter((s) => (by.get(s)?.runs ?? 0) === 0);
  const seen = stats
    .filter((s) => s.runs > 0 && allSpecs.includes(s.spec))
    .sort((a, b) => a.passes / a.runs - b.passes / b.runs || b.p90Ms - a.p90Ms || (a.spec < b.spec ? -1 : 1))
    .map((s) => s.spec);
  return [...never, ...seen];
}

/** Takes specs in rank order while the estimated time (p90 or DEFAULT_SPEC_MS, times repeat) fits the budget; always at least one. */
export function pickSlice(allSpecs: readonly string[], ledger: Ledger, budgetMin: number, repeat: number): string[] {
  const stats = rollUp(ledger);
  const cost = new Map(stats.map((s) => [s.spec, s.p90Ms > 0 ? s.p90Ms : DEFAULT_SPEC_MS]));
  const picked: string[] = [];
  let ms = 0;
  for (const spec of rank(allSpecs, stats)) {
    const c = (cost.get(spec) ?? DEFAULT_SPEC_MS) * repeat;
    if (picked.length > 0 && ms + c > budgetMin * 60_000) continue;
    picked.push(spec);
    ms += c;
  }
  return picked;
}

/** Why a real run is refused, or undefined. */
export function refusal(env: NodeJS.ProcessEnv, hasRemote: boolean): string | undefined {
  if (env['CI']) return 'CI is set: flake hunts are PC-only lane jobs';
  if (env['TTE_E2E_LOCAL'] || env['TTE_ALLOW_MAC_E2E']) return 'the Mac is not allowed for flake hunts';
  if (!hasRemote) return 'no PC remote (set TTE_REMOTE or git config tte.remote)';
  return undefined;
}

export function command(specs: readonly string[], repeat: number): string[] {
  return ['corepack', 'pnpm', 'e2e:flake', '--repeat', String(repeat), ...specs];
}

function main(): void {
  const argv = process.argv.slice(2);
  let budget = 60;
  let repeat = 5;
  const dry = argv.includes('--dry-run');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--budget-min') budget = Number(argv[++i]);
    else if (argv[i] === '--repeat') repeat = Number(argv[++i]);
  }
  if (!(budget > 0) || !Number.isInteger(repeat) || repeat < 1) throw new Error('--budget-min needs a positive number, --repeat a positive integer');
  const all = readdirSync('tests/e2e')
    .filter((f) => f.endsWith('.spec.ts'))
    .sort()
    .map((f) => `tests/e2e/${f}`);
  const ledger = existsSync(LEDGER_PATH) ? (JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger) : {};
  const specs = pickSlice(all, ledger, budget, repeat);
  const cmd = command(specs, repeat);
  process.stdout.write(
    `flake hunt: ${String(specs.length)}/${String(all.length)} specs, budget ${String(budget)} min, repeat ${String(repeat)}\n${specs.join('\n')}\n$ ${cmd.join(' ')}\n`,
  );
  if (dry) return;
  const remote = process.env['TTE_REMOTE'] || spawnSync('git', ['config', 'tte.remote'], { encoding: 'utf8' }).stdout.trim();
  const why = refusal(process.env, Boolean(remote));
  if (why) {
    process.stderr.write(`flake hunt refused: ${why}\n`);
    process.exit(2);
  }
  const r = spawnSync(cmd[0] as string, cmd.slice(1), { stdio: 'inherit' });
  if (existsSync(ROUTER_SUMMARY)) {
    spawnSync('corepack', ['pnpm', 'exec', 'tsx', 'tools/ci/flake-ledger.ts', 'merge', ROUTER_SUMMARY], { stdio: 'inherit' });
  }
  process.exit(r.status ?? 1);
}

if (process.argv[1]?.endsWith('flake-hunt.ts')) main();
