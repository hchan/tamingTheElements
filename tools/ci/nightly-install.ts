/**
 * Install or remove the two launchd LaunchAgents of the nightly e2e (submit 23:00, collect 06:00). Paths (repo, corepack, PATH,
 * HOME) are filled into tools/ci/launchd/dev.tte.nightly-e2e.plist.tmpl here, at install time; nothing machine-specific is committed.
 * `pnpm nightly:install [--dry-run] [--uninstall]`. launchd runs a missed calendar job once on wake.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface Job {
  readonly label: string;
  readonly subcommand: 'submit' | 'collect';
  readonly hour: number;
  readonly minute: number;
}
export const JOBS: readonly Job[] = [
  { label: 'dev.tte.nightly-e2e-submit', subcommand: 'submit', hour: 23, minute: 0 },
  { label: 'dev.tte.nightly-e2e-collect', subcommand: 'collect', hour: 6, minute: 0 },
];

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Fill `{{KEY}}` placeholders (XML-escaped); throws on a placeholder left unfilled. */
export function render(tmpl: string, vars: Readonly<Record<string, string>>): string {
  const out = tmpl.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => (k in vars ? esc(vars[k] as string) : m));
  const left = /\{\{[A-Z_]+\}\}/.exec(out);
  if (left) throw new Error(`unfilled placeholder ${left[0]}`);
  return out;
}

export function varsFor(job: Job, o: { repo: string; corepack: string; path: string; home: string; log: string }): Record<string, string> {
  return {
    LABEL: job.label,
    SUBCOMMAND: job.subcommand,
    HOUR: String(job.hour),
    MINUTE: String(job.minute),
    REPO: o.repo,
    COREPACK: o.corepack,
    PATH: o.path,
    HOME: o.home,
    LOG: o.log,
  };
}

function sh(cmd: string): string {
  return spawnSync('/bin/sh', ['-c', cmd], { encoding: 'utf8' }).stdout.trim();
}

export function main(argv: readonly string[]): number {
  const uninstall = argv.includes('--uninstall');
  const dry = argv.includes('--dry-run');
  const repo = resolve(import.meta.dirname, '../..');
  const home = homedir();
  const agents = join(home, 'Library', 'LaunchAgents');
  const logs = join(home, 'Library', 'Logs');
  const uid = sh('id -u');
  const tmpl = readFileSync(join(repo, 'tools/ci/launchd/dev.tte.nightly-e2e.plist.tmpl'), 'utf8');
  const corepack = sh('command -v corepack');
  if (!uninstall && !corepack) {
    process.stderr.write('corepack not found on PATH\n');
    return 2;
  }
  for (const job of JOBS) {
    const file = join(agents, `${job.label}.plist`);
    const target = `gui/${uid}/${job.label}`;
    if (uninstall) {
      process.stdout.write(`${dry ? 'would remove' : 'removing'} ${file}\n`);
      if (!dry) {
        spawnSync('launchctl', ['bootout', target], { stdio: 'ignore' });
        rmSync(file, { force: true });
      }
      continue;
    }
    const text = render(tmpl, varsFor(job, { repo, corepack, path: process.env['PATH'] ?? '/usr/bin:/bin', home, log: join(logs, `${job.label}.log`) }));
    if (dry) {
      process.stdout.write(`--- ${file}\n${text}\n`);
      continue;
    }
    mkdirSync(agents, { recursive: true });
    mkdirSync(logs, { recursive: true });
    writeFileSync(file, text);
    spawnSync('launchctl', ['bootout', target], { stdio: 'ignore' });
    const r = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, file], { encoding: 'utf8' });
    if (r.status !== 0) {
      process.stderr.write(`launchctl bootstrap failed for ${job.label}: ${r.stderr}\n`);
      return 1;
    }
    process.stdout.write(`installed ${job.label} (${job.subcommand} ${String(job.hour)}:${String(job.minute).padStart(2, '0')})\n`);
  }
  return 0;
}

if (process.argv[1]?.endsWith('nightly-install.ts')) process.exit(main(process.argv.slice(2)));
