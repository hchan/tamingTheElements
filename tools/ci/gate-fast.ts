/**
 * `pnpm gate:fast [--base <ref>]`: the per-merge check (owner, 2026-11-21). Lint of the changed files, typecheck, depcruise,
 * the dom project and the core tests affected by the change (`vitest --changed <base>`, default HEAD~1) and, when any changed path is outside src/, the whole repo project (pin tests read files by path). It writes no
 * stamp: the full `gate:commit` (all tests, legacy, build, size) runs nightly before the 01:00 push job, which keeps its own
 * `gate:commit` on main. Docs/TESTING.md "Fast gate".
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const LINTABLE = /\.(ts|tsx|mts|cjs|js|mjs)$/;
/** Changed paths worth linting: existing source files only; a config change means lint everything (undefined). */
export function fastLintFiles(changed: readonly string[], exists: (p: string) => boolean): string[] | undefined {
  if (changed.some((p) => /^(eslint\.config|tsconfig|package\.json|pnpm-lock)/.test(p))) return undefined;
  return changed.filter((p) => LINTABLE.test(p) && exists(p));
}

/** The repo project holds pin tests that read files by path (docs, tools, assets, fixtures), which `--changed` cannot trace, so any change outside src/ runs it in full (owner, 2026-11-24). */
export function repoNeedsFull(changed: readonly string[]): boolean {
  return changed.some((p) => !p.startsWith('src/'));
}

export function parseBase(argv: readonly string[]): string {
  const i = argv.indexOf('--base');
  return i >= 0 ? (argv[i + 1] ?? 'HEAD~1') : 'HEAD~1';
}

const run = (name: string, args: string[]): Promise<{ name: string; code: number; sec: number; out: string }> =>
  new Promise((res) => {
    const t0 = Date.now();
    const c = spawn('corepack', ['pnpm', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    c.stdout.on('data', (d: Buffer) => chunks.push(d));
    c.stderr.on('data', (d: Buffer) => chunks.push(d));
    c.on('close', (code) => res({ name, code: code ?? 1, sec: Math.round((Date.now() - t0) / 1000), out: Buffer.concat(chunks).toString() }));
  });

async function main(): Promise<number> {
  const base = parseBase(process.argv.slice(2));
  const changed = execFileSync('git', ['diff', '--no-renames', '--name-only', base], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const lint = fastLintFiles(changed, existsSync);
  const steps: Promise<{ name: string; code: number; sec: number; out: string }>[] = [
    lint === undefined ? run('lint', ['lint']) : lint.length ? run('lint', ['exec', 'eslint', '--cache', '--cache-strategy', 'content', '--cache-location', '.scratch/eslintcache', ...lint]) : Promise.resolve({ name: 'lint', code: 0, sec: 0, out: '' }),
    run('typecheck', ['typecheck']),
    run('depcruise', ['depcruise']),
    run('test:dom', ['exec', 'vitest', 'run', '--project', 'dom']),
    repoNeedsFull(changed)
      ? Promise.all([
          run('test:core', ['exec', 'vitest', 'run', '--project', 'core', '--changed', base, '--passWithNoTests']),
          run('test:repo', ['exec', 'vitest', 'run', '--project', 'repo']),
        ]).then(([a, b]) => ({ name: 'test', code: a.code || b.code, sec: Math.max(a.sec, b.sec), out: a.out + b.out }))
      : run('test:changed', ['exec', 'vitest', 'run', '--project', 'core', '--project', 'repo', '--changed', base, '--passWithNoTests']),
  ];
  const results = await Promise.all(steps);
  let bad = 0;
  for (const r of results) {
    if (r.code !== 0) {
      bad++;
      console.log(`--- ${r.name} ---\n${r.out.split('\n').slice(-40).join('\n')}`);
    }
    console.log(`  ${r.code === 0 ? 'ok  ' : 'FAIL'} ${r.name.padEnd(13)} ${r.sec} s`);
  }
  console.log(`gate:fast (changed vs ${base}): ${bad ? 'FAIL' : 'pass'}; full gate:commit runs nightly`);
  return bad ? 1 : 0;
}

if (process.argv[1]?.endsWith('gate-fast.ts')) void main().then((c) => process.exit(c));
