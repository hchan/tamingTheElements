import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const NEXT = resolve(import.meta.dirname, '../../.claude/hooks/subagent-stop-next-idea.sh');
const PUSH = resolve(import.meta.dirname, '../../.claude/hooks/pre-push-local-ci.sh');
const SCRATCH = resolve(import.meta.dirname, '../../.scratch');

describe('subagent-stop-next-idea.sh', () => {
  const run = (payload: string) => spawnSync('bash', [NEXT], { input: payload, encoding: 'utf8' });
  it.each(['small-planner', 'code-reviewer', 'new-thing-reviewer', 'parity-verifier', 'gameplay-balance-analyst', 'Plan', 'Explore', 'repo-score'])('silent for %s', (t) => {
    const r = run(JSON.stringify({ agent_type: t }));
    expect([r.status, r.stdout]).toEqual([0, '']);
  });
  it.each(['wp-implementer', 'hero-artist', ''])('nudges for builder type "%s"', (t) => {
    const r = run(JSON.stringify({ agent_type: t }));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('An agent just finished');
  });
});

const cleanEnv = (): NodeJS.ProcessEnv => {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
};

describe('pre-push-local-ci.sh docs-only rule and fail-closed', () => {
  let base = '';
  let bin = '';
  let n = 0;
  const git = (repo: string, ...a: string[]) => {
    const r = spawnSync(
      'git',
      ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...a],
      { encoding: 'utf8', env: cleanEnv() },
    );
    expect(r.status, r.stderr).toBe(0);
  };
  const calls = () => {
    try {
      return readFileSync(join(bin, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  };
  const run = (repo: string, command: string, cwd = repo) => {
    rmSync(join(bin, 'calls.log'), { force: true });
    const r = spawnSync('bash', [PUSH], {
      input: JSON.stringify({ cwd, tool_input: { command } }),
      encoding: 'utf8',
      env: { ...cleanEnv(), PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH ?? ''}`, CLAUDE_PROJECT_DIR: repo, FAKE_BIN: bin },
    });
    return { code: r.status, err: r.stderr };
  };
  const write = (repo: string, f: string) => {
    mkdirSync(dirname(join(repo, f)), { recursive: true });
    writeFileSync(join(repo, f), `${f}${String(n++)}`);
  };
  const commit = (repo: string, ...files: string[]) => {
    for (const f of files) write(repo, f);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-qm', 'c');
  };
  /** Fresh repo on branch main with src/x.ts committed; origin/main (if wanted) points at that base commit. */
  const mkRepo = (origin = true) => {
    const repo = join(base, `repo${String(n++)}`);
    mkdirSync(join(repo, 'tools/ci'), { recursive: true });
    expect(spawnSync('git', ['init', '-q', '-b', 'main', repo], { env: cleanEnv() }).status).toBe(0);
    writeFileSync(join(repo, 'tools/ci/gate.ts'), '');
    commit(repo, 'src/x.ts');
    if (origin) git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    return repo;
  };

  beforeAll(() => {
    mkdirSync(SCRATCH, { recursive: true });
    base = realpathSync(mkdtempSync(join(SCRATCH, 'hook-hardening-')));
    bin = join(base, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'pnpm'), '#!/bin/bash\necho "$*" >> "$FAKE_BIN/calls.log"\nexit 0\n');
    chmodSync(join(bin, 'pnpm'), 0o755);
  });
  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  const DOCS_RUN = ['exec vitest run tests/repo'];
  const FULL_RUN = ['run --silent gate:commit --hook'];

  it('docs-only range: runs tests/repo instead of gate:commit and names the rule', () => {
    const repo = mkRepo();
    commit(repo, 'docs/a.md', 'ideas/x.txt', '.claude/y.json');
    const r = run(repo, 'git push origin main');
    expect(r.code).toBe(0);
    expect(r.err).toContain('gate:commit skipped (docs-only rule');
    expect(r.err).toContain('exec vitest run tests/repo ok');
    expect(r.err).not.toContain('gate:commit ok');
    expect(calls()).toEqual(DOCS_RUN);
  });

  it('a *.md file anywhere (even under src/) counts as docs', () => {
    const repo = mkRepo();
    commit(repo, 'src/NOTES.md');
    expect(run(repo, 'git push').code).toBe(0);
    expect(calls()).toEqual(DOCS_RUN);
  });

  it('code in the range runs the full gate', () => {
    const repo = mkRepo();
    commit(repo, 'docs/a.md', 'src/core/a.ts');
    const r = run(repo, 'git push origin main');
    expect(r.code).toBe(0);
    expect(r.err).not.toContain('skipped');
    expect(calls()).toEqual(FULL_RUN);
  });

  it('a rename from code into docs is not docs-only', () => {
    const repo = mkRepo();
    mkdirSync(join(repo, 'docs'), { recursive: true });
    git(repo, 'mv', 'src/x.ts', 'docs/x.md');
    git(repo, 'commit', '-qm', 'rename');
    expect(run(repo, 'git push origin main').code).toBe(0);
    expect(calls()).toEqual(FULL_RUN);
  });

  it('no origin/main: full gate', () => {
    const repo = mkRepo(false);
    commit(repo, 'docs/a.md');
    expect(run(repo, 'git push').code).toBe(0);
    expect(calls()).toEqual(FULL_RUN);
  });

  it.each(['git push --force origin main', 'git push origin other:main', 'git push origin feature', 'git push upstream main'])(
    'not a plain current-branch push: full gate for %s',
    (c) => {
      const repo = mkRepo();
      commit(repo, 'docs/a.md');
      expect(run(repo, c).code).toBe(0);
      expect(calls()).toEqual(FULL_RUN);
    },
  );

  it('fails closed when git rev-parse fails', () => {
    const repo = mkRepo();
    const r = run(repo, 'git -C / push');
    expect(r.code).toBe(2);
    expect(r.err).toContain('fail closed');
    expect(calls()).toEqual([]);
  });
});
