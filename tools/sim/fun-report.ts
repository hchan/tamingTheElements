// `pnpm fun:report`: plays AI-vs-AI matches and prints the fun metrics of docs/FUN-DESIGN.md section 4.
//   pnpm fun:report [--ruleset arcade] [--team-size 1|2] [--seeds 2] [--seed 1] [--level 1] [--all] [--json]
// By default a sample of RACES.length pairings (each race against the next); --all plays all 66. Writes out/fun-report.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { type FunSummary, summarizeFun } from './fun-metrics';
import { RACES, type Ruleset, parseRuleOptions, runPairing } from './run-match';

export interface FunReportOptions {
  readonly ruleset: Ruleset;
  readonly teamSize: 1 | 2;
  readonly aiLevel: number;
  readonly seeds: number;
  readonly seed: number;
  readonly level: number;
  readonly all: boolean;
}

export interface FunReport {
  readonly options: FunReportOptions;
  readonly overall: FunSummary;
  readonly pairs: readonly { readonly a: string; readonly b: string; readonly winsA: number; readonly winsB: number; readonly summary: FunSummary }[];
}

/** Scripted vs scripted; every pairing alternates sides on odd seeds (see run-match). Classic matches carry no fun metrics. */
export function funReport(o: FunReportOptions): FunReport {
  const pairs: [string, string][] = [];
  RACES.forEach((a, i) => {
    if (o.all) RACES.slice(i + 1).forEach((b) => pairs.push([a, b]));
    else pairs.push([a, RACES[(i + 1) % RACES.length] ?? a]);
  });
  const all = [];
  const rows = [];
  for (const [a, b] of pairs) {
    const { summary, results } = runPairing({
      a, b, agents: ['scripted', 'scripted'], seeds: o.seeds, seed: o.seed, level: o.level, difficulty: 1,
      ruleset: o.ruleset, teamSize: o.teamSize, aiLevel: o.aiLevel,
    });
    const fun = results.flatMap((r) => (r.fun === undefined ? [] : [r.fun]));
    all.push(...fun);
    rows.push({ a, b, winsA: summary.winsA, winsB: summary.winsB, summary: summarizeFun(fun) });
  }
  return { options: o, overall: summarizeFun(all), pairs: rows };
}

export function formatFunReport(r: FunReport): string {
  const o = r.overall;
  return [
    `Fun report: ${r.options.ruleset}, team size ${String(r.options.teamSize)}, ${String(o.matches)} matches (${String(r.pairs.length)} pairings x ${String(r.options.seeds)} seeds)`,
    `  match length       median ${o.medianSeconds.toFixed(1)} s, p10 ${o.p10Seconds.toFixed(1)} s, p90 ${o.p90Seconds.toFixed(1)} s`,
    `  stalemate / timeout ${(o.stalemateRate * 100).toFixed(1)}% / ${(o.timeoutRate * 100).toFixed(1)}%`,
    `  first hit          median ${o.medianFirstHitSeconds.toFixed(1)} s`,
    `  hits per combo     median ${String(o.medianComboHits)}, p90 ${String(o.p90ComboHits)}, max ${String(o.maxComboHits)}`,
    `  damage diversity   median ${o.medianDiversity.toFixed(2)}, worst top source ${(o.maxTopSourceShare * 100).toFixed(0)}%`,
    `  lead changes       median ${String(o.medianLeadChanges)}`,
    `  counter-hit rate   ${(o.counterHitRate * 100).toFixed(1)}%; cap recoveries juggle ${String(o.jugglecapRecoveries)}, stun ${String(o.stuncapRecoveries)}`,
    `  dash/tag/super/clash/defence  ${[o.dashes, o.tags, o.supers, o.clashes, o.defence].join('/')} (zero until their work packages land)`,
  ].join('\n');
}

export function main(argv: readonly string[]): number {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: {
        ruleset: { type: 'string' }, 'team-size': { type: 'string' }, 'ai-level': { type: 'string' },
        seeds: { type: 'string' }, seed: { type: 'string' }, level: { type: 'string' },
        all: { type: 'boolean' }, json: { type: 'boolean' },
      },
    });
    const rules = parseRuleOptions(values.ruleset ?? 'arcade', values['team-size'], values['ai-level']);
    const report = funReport({
      ...rules, seeds: Number(values.seeds ?? 2), seed: Number(values.seed ?? 1), level: Number(values.level ?? 1), all: values.all === true,
    });
    mkdirSync('out', { recursive: true });
    writeFileSync('out/fun-report.json', JSON.stringify(report, null, 2));
    console.log(values.json === true ? JSON.stringify(report, null, 2) : formatFunReport(report));
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
