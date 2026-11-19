import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HOOK = resolve('.claude/hooks/pre-tool-pc-guard.sh');
const hasJq = spawnSync('jq', ['--version']).status === 0;
const ALIAS = 'fake-guard-alias';

const run = (command: string, env: Record<string, string> = {}): { code: number | null; err: string } => {
  const r = spawnSync('bash', [HOOK], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
    env: { ...process.env, TTE_REMOTE: ALIAS, TTE_PC_GUARD: '', TTE_PC_RAW: '', ...env },
  });
  return { code: r.status, err: r.stderr };
};

describe.skipIf(!hasJq)('pre-tool-pc-guard.sh (warn mode)', () => {
  it.each([
    `ssh ${ALIAS} wsl -d Ubuntu -- ls tte-jobs`,
    `scp file ${ALIAS}:tte-offload/x`,
    `rsync -a out/ ${ALIAS}:tte-gpu/`,
    'python3 tools/assets/roster24-art/gpu-queue.py run q.json',
    'bash run-queue.sh',
  ])('warns but never blocks: %s', (c) => {
    const r = run(c);
    expect(r.code).toBe(0);
    expect(r.err).toContain('pc-guard');
    expect(r.err).not.toContain(ALIAS);
  });

  it.each([
    'corepack pnpm gpu:submit q.json',
    'pnpm gpu:status',
    'pnpm e2e -- tests/e2e/x.spec.ts',
    'pnpm pc:probe',
    'git status',
    `grep -rn ${ALIAS} .`,
    'python3 tools/assets/roster24-art/gpu-queue.py --dry-run q.json',
    'ls /tmp',
    `TTE_PC_RAW=1 ssh ${ALIAS} wsl -- ls`,
  ])('stays silent: %s', (c) => {
    expect(run(c)).toEqual({ code: 0, err: '' });
  });

  it('TTE_PC_RAW=1 in the environment bypasses; block mode exits 2', () => {
    expect(run(`ssh ${ALIAS} wsl -- ls`, { TTE_PC_RAW: '1' }).err).toBe('');
    expect(run(`ssh ${ALIAS} wsl -- ls`, { TTE_PC_GUARD: 'block' }).code).toBe(2);
  });

  it('fails open without an alias or with a garbage payload', () => {
    const r = spawnSync('bash', [HOOK], { input: 'not json', encoding: 'utf8', env: { ...process.env, TTE_REMOTE: ALIAS } });
    expect([r.status, r.stderr]).toEqual([0, '']);
    const noAlias = spawnSync('bash', [HOOK], {
      input: JSON.stringify({ tool_input: { command: 'ssh x wsl -- ls' } }),
      encoding: 'utf8',
      cwd: '/',
      env: { ...process.env, TTE_REMOTE: '', CLAUDE_PROJECT_DIR: '/', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    });
    expect([noAlias.status, noAlias.stderr]).toEqual([0, '']);
  });
});
