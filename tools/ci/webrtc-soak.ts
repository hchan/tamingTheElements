// `pnpm soak:webrtc [--ticks N] [--grid default|harsh] [--natural]`: OPT-IN long WebRTC/rollback soak (not in the gate, run at night).
// Runs tests/e2e/online-match.spec.ts once per `?netsim=` grid entry (both lockstep and rollback), with a longer draw limit, and
// prints a table of pass/fail and wall seconds per entry. The spec itself asserts no desync, same winner and identical
// checkpoint hashes. Progress is appended to ~/claudetmp/progress/webrtc-soak.log. Use E2E_PORT to run beside other worktrees.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const GRIDS: Record<string, readonly string[]> = {
  default: ['lat:60,jitter:20,loss:10'],
  harsh: ['lat:120,jitter:40,loss:20', 'lat:200,jitter:60,loss:20,dup:10', 'lat:200,jitter:80,loss:30,dup:10'],
};

export function parseArgs(argv: readonly string[]): { ticks: number; grid: string; natural: boolean } {
  const get = (f: string, d: string): string => {
    const i = argv.indexOf(f);
    return i >= 0 ? (argv[i + 1] ?? d) : d;
  };
  return { ticks: Number(get('--ticks', '5000')), grid: get('--grid', 'harsh'), natural: argv.includes('--natural') };
}

function main(): void {
  const { ticks, grid, natural } = parseArgs(process.argv.slice(2));
  const entries = GRIDS[grid];
  if (!entries) throw new Error(`unknown grid ${grid} (${Object.keys(GRIDS).join(', ')})`);
  const dir = join(homedir(), 'claudetmp', 'progress');
  mkdirSync(dir, { recursive: true });
  const log = (m: string): void => {
    console.log(m);
    appendFileSync(join(dir, 'webrtc-soak.log'), `${new Date().toISOString()} ${m}\n`);
  };
  const rows: string[] = [];
  let failed = false;
  for (const sim of entries) {
    const t0 = Date.now();
    log(`soak start netsim ${sim}, ${natural ? 'natural match' : `${String(ticks)} ticks`}`);
    const r = spawnSync(join('node_modules', '.bin', 'playwright'), ['test','tests/e2e/online-match.spec.ts', '--workers=1', '--retries=0', '--grep', 'netsim'], {
      env: { ...process.env, TTE_NETSIM: sim, TTE_MATCH_TICKS: String(ticks), ...(natural ? { TTE_NATURAL_MATCH: '1' } : {}) },
      encoding: 'utf8',
    });
    const out = `${r.error?.message ?? ''}${r.stdout}${r.stderr}`;
    for (const line of out.split('\n')) if (line.includes('match ended at sim tick')) log(`  ${line.trim()}`);
    const ok = r.status === 0;
    if (!ok) {
      failed = true;
      log(out.split('\n').slice(-40).join('\n'));
    }
    rows.push(`${ok ? 'PASS' : 'FAIL'}  ${String(Math.round((Date.now() - t0) / 1000)).padStart(5)} s  ${sim}`);
  }
  log(`soak summary\n${rows.join('\n')}`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1]?.endsWith('webrtc-soak.ts')) main();
