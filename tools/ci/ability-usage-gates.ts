// Nightly ability-usage gate (ideas/done/ability-usage-nightly-gate.md). Headless only.
//   tsx tools/ci/ability-usage-gates.ts [--seeds 8] [--seed 1] [--out out/ability-usage-gates.json] [--no-fail]
// Plays tools/sim/ability-usage.ts (Arcade, AI level 3, all 1v1 pairings) and exits 1 when an ability slot is dead
// (under deadBelowCastsPerMinute) or a hero's top slot takes more of its casts than the committed maxTopShare band in
// tools/ci/ability-usage-gates.json. Read-only: it never touches src/core.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { type UsageRow, measure, report } from '../sim/ability-usage';

export interface AbilityGateConfig {
  readonly deadBelowCastsPerMinute: number;
  readonly maxTopShare: Readonly<Record<string, number>>;
}

const CONFIG_PATH = new URL('./ability-usage-gates.json', import.meta.url);
export const loadAbilityGateConfig = (path: URL | string = CONFIG_PATH): AbilityGateConfig => JSON.parse(readFileSync(path, 'utf8')) as AbilityGateConfig;

/** Human-readable failures of the usage rows against the bands (empty when all pass). */
export function judgeAbilityGates(rows: readonly UsageRow[], config: AbilityGateConfig = loadAbilityGateConfig()): string[] {
  const fails: string[] = [];
  for (const r of rows) {
    if (r.castsPerMinute < config.deadBelowCastsPerMinute) {
      fails.push(`${r.race}/${r.ability} is dead: ${r.castsPerMinute.toFixed(2)} casts/min < ${String(config.deadBelowCastsPerMinute)}`);
    }
  }
  const races = [...new Set(rows.map((r) => r.race))];
  for (const race of races) {
    const top = Math.max(...rows.filter((r) => r.race === race).map((r) => r.castShare));
    const band = config.maxTopShare[race];
    if (band === undefined) fails.push(`${race}: no maxTopShare band in ability-usage-gates.json`);
    else if (top > band) fails.push(`${race}: top slot cast share ${top.toFixed(3)} > band ${String(band)}`);
  }
  return fails;
}

export function main(argv: readonly string[]): number {
  try {
    const { values } = parseArgs({ args: [...argv], options: { seeds: { type: 'string' }, seed: { type: 'string' }, out: { type: 'string' }, 'no-fail': { type: 'boolean' } } });
    const { rows } = report(measure('arcade', Number(values.seeds ?? 8), Number(values.seed ?? 1), 3));
    const fails = judgeAbilityGates(rows);
    console.log(fails.length === 0 ? `Ability usage gates: ok (${String(rows.length)} slots)` : `Ability usage gates FAILED:\n${fails.map((f) => `  ${f}`).join('\n')}`);
    const out = values.out ?? 'out/ability-usage-gates.json';
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ fails, rows }, null, 2));
    return fails.length === 0 || values['no-fail'] === true ? 0 : 1;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
