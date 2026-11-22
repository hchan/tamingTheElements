/**
 * Nightly flake slice: `tsx tools/ci/nightly-flake.ts run` (LaunchAgent `dev.tte.nightly-flake`, 00:30, installed only by
 * `pnpm nightly:install --with-flake`). Runs `pnpm flake:hunt` on the PC after the 23:00 full run, with a hard stop at 06:30.
 * SKIPS (exit 0, one reason line) when the PC probe is not `up` (down, broken, or busy: a full run or other lane job still holds it),
 * the GPU is at 80 C or more, free RAM is under 4 GB, or a GPU job is running. Missing metrics never block (as in pc-probe).
 * Disabled by default: without the gitignored file `.claude/flake-nightly.on` (or TTE_FLAKE_NIGHTLY=1) it only prints what it
 * would do (`flake:hunt --dry-run`). `--dry-run` forces that. Never the Mac; flake-hunt itself refuses CI and Mac env.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cacheFile, keyOf, probe, readCache, writeCache, type Probe } from './pc-probe';
import type { Remote } from './pc-remote';

export const GPU_TEMP_MAX_C = 80;
export const FREE_RAM_MIN_MB = 4096;
export const HARD_STOP_HOUR = 6;
export const HARD_STOP_MINUTE = 30;
export const MIN_BUDGET_MIN = 10;
export const ENABLE_FILE = '.claude/flake-nightly.on';

/** Why the slice must not run now, or undefined. Pure: the probe is injected. */
export function skipReason(p: Probe): string | undefined {
  if (p.state !== 'up') return `PC ${p.state}${p.why ? ` (${p.why})` : ''}`;
  if (p.gpuJobs > 0) return `GPU job running (${String(p.gpuJobs)})`;
  if (p.gpuTemp !== undefined && p.gpuTemp >= GPU_TEMP_MAX_C) return `GPU ${String(p.gpuTemp)} C (limit ${String(GPU_TEMP_MAX_C)})`;
  if (p.memMb !== undefined && p.memMb < FREE_RAM_MIN_MB) return `free RAM ${(p.memMb / 1024).toFixed(1)} GB (need ${String(FREE_RAM_MIN_MB / 1024)})`;
  return undefined;
}

/** The 06:30 local time of the night `now` belongs to (an evening `now` means tomorrow's 06:30), as epoch ms. */
export function hardStop(now: Date): number {
  const d = new Date(now);
  d.setHours(HARD_STOP_HOUR, HARD_STOP_MINUTE, 0, 0);
  if (d.getTime() < now.getTime() - 12 * 3_600_000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Whole minutes left until the hard stop (negative when past). */
export const budgetMin = (now: Date): number => Math.floor((hardStop(now) - now.getTime()) / 60_000);

export interface Plan {
  action: 'skip' | 'dry-run' | 'run';
  reason?: string;
  budgetMin: number;
}

/** Decide the action. A skip reason wins; `enabled` false or `dryRun` true never runs; too little time skips. */
export function decide(p: Probe, now: Date, enabled: boolean, dryRun: boolean): Plan {
  const budget = budgetMin(now);
  const why = skipReason(p);
  if (why) return { action: 'skip', reason: why, budgetMin: budget };
  if (budget < MIN_BUDGET_MIN) return { action: 'skip', reason: `only ${String(budget)} min before the ${String(HARD_STOP_HOUR)}:${String(HARD_STOP_MINUTE)} hard stop`, budgetMin: budget };
  if (!enabled || dryRun) return { action: 'dry-run', reason: dryRun ? '--dry-run' : `not enabled, create ${ENABLE_FILE}`, budgetMin: budget };
  return { action: 'run', budgetMin: budget };
}

const sh = (cmd: string, args: string[], cwd: string, timeout?: number): number =>
  spawnSync(cmd, args, { cwd, stdio: 'inherit', ...(timeout ? { timeout, killSignal: 'SIGKILL' as const } : {}) }).status ?? 1;

export async function main(argv: readonly string[], env: NodeJS.ProcessEnv = process.env, cwd = process.cwd(), now = new Date()): Promise<number> {
  if (argv[0] !== 'run') {
    process.stderr.write('usage: nightly-flake.ts run [--dry-run]\n');
    return 2;
  }
  const alias = env['TTE_REMOTE']?.trim() || spawnSync('git', ['config', '--get', 'tte.remote'], { cwd, encoding: 'utf8' }).stdout.trim();
  if (!alias) {
    process.stdout.write('nightly flake: skipped, no PC configured\n');
    return 0;
  }
  const file = cacheFile(cwd);
  const remote: Remote = { alias, distro: env['TTE_REMOTE_DISTRO'] || 'Ubuntu', ssh: env['TTE_SSH'] || 'ssh' };
  const hit = readCache(file, now.getTime(), 60, keyOf(alias));
  const p = hit ?? (await probe(remote));
  if (!hit) writeCache(file, p);
  const enabled = existsSync(resolve(cwd, ENABLE_FILE)) || env['TTE_FLAKE_NIGHTLY'] === '1';
  const plan = decide(p, now, enabled, argv.includes('--dry-run'));
  if (plan.action === 'skip') {
    process.stdout.write(`nightly flake: skipped, ${plan.reason ?? ''}\n`);
    return 0;
  }
  const hunt = ['pnpm', 'flake:hunt', '--budget-min', String(plan.budgetMin)];
  if (plan.action === 'dry-run') {
    process.stdout.write(`nightly flake: dry run (${plan.reason ?? ''}), budget ${String(plan.budgetMin)} min\n`);
    return sh('corepack', [...hunt, '--dry-run'], cwd);
  }
  // Hard stop: kill the hunt at 06:30 even if its own estimate was off.
  return sh('corepack', hunt, cwd, Math.max(1, hardStop(now) - now.getTime()));
}

if (process.argv[1]?.endsWith('nightly-flake.ts')) void main(process.argv.slice(2)).then((c) => process.exit(c));
