import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HOOK = resolve(import.meta.dirname, '../../.claude/hooks/pre-tool-pc-guard.sh');
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

describe.skipIf(!hasJq)('pre-tool-pc-guard.sh', () => {
  it.each([
    `ssh ${ALIAS} wsl -d Ubuntu -- ls tte-jobs`,
    `scp file ${ALIAS}:tte-offload/x`,
    `rsync -a out/ ${ALIAS}:tte-gpu/`,
    'python3 tools/assets/roster24-art/gpu-queue.py run q.json',
    'bash run-queue.sh',
  ])('warn mode never blocks: %s', (c) => {
    const r = run(c, { TTE_PC_GUARD: 'warn' });
    expect(r.code).toBe(0);
    expect(r.err).toContain('pc-guard');
    expect(r.err).not.toContain(ALIAS);
  });

  it.each([
    `ssh ${ALIAS} ls`,
    `cat x | ssh ${ALIAS} 'cat > y'`,
    `pnpm e2e; ssh ${ALIAS} ls`,
    `pnpm gpu:status && ssh ${ALIAS} ls`,
    `git status || scp f ${ALIAS}:x`,
    `ls\nssh ${ALIAS} ls`,
    `bash -c "ssh ${ALIAS} ls"`,
    `x=1 '/usr/bin/ssh' '${ALIAS}' ls`,
    'ssh "$PCHOST" ls',
    'python3 tools/assets/roster24-art/gpu-queue.py run q.json',
    'python3 -u gpu-queue.py run q.json',
    'bash tools/assets/roster24-art/run-queue.sh',
    './run-queue.sh',
  ])('blocks by default (exit 2, alias never printed): %s', (c) => {
    const r = run(c);
    expect(r.code).toBe(2);
    expect(r.err).toContain('BLOCKED');
    expect(r.err).not.toContain(ALIAS);
  });

  it.each([
    'sed -n 1,40p tools/assets/roster24-art/gpu-queue.py',
    'wc -l tools/assets/roster24-art/gpu-queue.py tools/assets/roster24-art/run-queue.sh',
    'shellcheck tools/assets/roster24-art/run-queue.sh',
    'python3 -m py_compile tools/assets/roster24-art/gpu-queue.py',
    'bash -n tools/assets/roster24-art/run-queue.sh',
    'head -20 run-queue.sh',
  ])('reading or checking the queue tooling is not blocked: %s', (c) => {
    expect(run(c)).toEqual({ code: 0, err: '' });
  });

  it.each([
    'corepack pnpm gpu:submit q.json',
    'pnpm gpu:status && git status',
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
    expect(run(`ssh ${ALIAS} wsl -- ls`, { TTE_PC_GUARD: 'bogus' }).code).toBe(2);
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
