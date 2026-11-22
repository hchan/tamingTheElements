/** `pnpm load:check [--cap 14]`: prints the 1-min load average against a cap (default: CPU core count); exit 1 when above. */
import { cpus, loadavg } from 'node:os';

export interface LoadVerdict { load: number; cap: number; ok: boolean }
/** Cap = `--cap` when given, else the core count (14 when os reports no cpus). */
export function loadVerdict(load1: number, argv: readonly string[], cores: number): LoadVerdict {
  const i = argv.indexOf('--cap');
  const given = i >= 0 ? Number(argv[i + 1]) : NaN;
  const cap = Number.isFinite(given) && given > 0 ? given : cores > 0 ? cores : 14;
  return { load: load1, cap, ok: load1 <= cap };
}

if (process.argv[1]?.endsWith('load-check.ts')) {
  const v = loadVerdict(loadavg()[0] ?? 0, process.argv.slice(2), cpus().length);
  console.log(`load ${v.load.toFixed(2)} vs cap ${v.cap}: ${v.ok ? 'ok' : 'above cap (limit builders to 2-3)'}`);
  process.exit(v.ok ? 0 : 1);
}
