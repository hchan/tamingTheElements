import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HOOK = resolve('.claude/hooks/pre-push-local-ci.sh');
const MATCH = resolve('.claude/hooks/push-match.mjs');
const SCRATCH = resolve('.scratch');

const parse = (command: string, cwd: string): string[] => {
  const r = spawnSync('node', [MATCH, '--cli'], { input: JSON.stringify({ cwd, tool_input: { command } }), encoding: 'utf8' });
  expect(r.status).toBe(0);
  return r.stdout.split('\n').filter(Boolean);
};

describe('push-match.mjs', () => {
  const cwd = '/work/repo';
  it.each([
    ['git push', ['dir\t/work/repo']],
    ['git push origin main 2>&1 | tail -5', ['dir\t/work/repo']],
    ['git -C /x/y push', ['dir\t/x/y']],
    ['git -C a -C b push', ['dir\t/work/repo/a/b']],
    ['git -c k=v push origin', ['dir\t/work/repo']],
    ['git --no-pager push', ['dir\t/work/repo']],
    ['cd /elsewhere && git push', ['dir\t/elsewhere']],
    ['cd sub; git push', ['dir\t/work/repo/sub']],
    ['FOO=1 git push', ['dir\t/work/repo']],
    ['env X=1 nice -n 5 git push', ['dir\t/work/repo']],
    ['/usr/bin/git push', ['dir\t/work/repo']],
    ['echo hi && (git push)', ['dir\t/work/repo']],
    ['echo $(git push)', ['dir\t/work/repo']],
    ['bash -c "git push origin main"', ['dir\t/work/repo']],
    ['cat <<EOF\n$(git push)\nEOF', ['dir\t/work/repo']],
    ['git push --dry-run', ['dir\t/work/repo']],
    ['git merge --no-ff x && git push origin main', ['moved\tmerge']],
    ['git commit -m x; git push', ['moved\tcommit']],
    ['git -C "$D" push', ['unknown\t-C with a non-literal path']],
    ['cd - && git push', ['unknown\tthe working directory is not known here']],
    ['git --git-dir=x push', ['unknown\t--git-dir is used']],
  ])('finds: %s', (c, want) => {
    expect(parse(c, cwd)).toEqual(want);
  });

  it.each([
    'echo "git push"',
    "grep -rn 'git push' docs",
    'git stash push -m x',
    'git log --grep push',
    'git help push',
    'git push-foo',
    'cat <<EOF\ngit push origin main\nEOF',
    "cat <<'EOF'\n$(git push)\nEOF",
    "cat <<-'EOF' > plan.md\n\tgit push\n\tEOF\nls",
    'cat <<< "git push"',
    'echo ok # git push',
    'git status && echo pushed',
    "bash -c 'echo push'",
  ])('ignores text: %s', (c) => {
    expect(parse(c, cwd)).toEqual([]);
  });

  it('exits non-zero on a payload that is not JSON', () => {
    expect(spawnSync('node', [MATCH, '--cli'], { input: 'nope', encoding: 'utf8' }).status).not.toBe(0);
  });
});

describe('pre-push-local-ci.sh', () => {
  let base = '';
  let repo = '';
  let other = '';
  let bin = '';
  const calls = () => {
    try {
      return readFileSync(join(bin, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  };
  const run = (command: string, env: Record<string, string> = {}, cwd = repo) => {
    rmSync(join(bin, 'calls.log'), { force: true });
    const r = spawnSync('bash', [HOOK], {
      input: JSON.stringify({ cwd, tool_input: { command } }),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH ?? ''}`,
        CLAUDE_PROJECT_DIR: repo,
        FAKE_BIN: bin,
        FAKE_RC: '0',
        ...env,
      },
    });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };

  beforeAll(() => {
    mkdirSync(SCRATCH, { recursive: true });
    base = realpathSync(mkdtempSync(join(SCRATCH, 'pre-push-hook-')));
    repo = join(base, 'repo');
    other = join(base, 'other');
    bin = join(base, 'bin');
    for (const d of [repo, other, bin]) mkdirSync(d, { recursive: true });
    for (const d of [repo, other]) spawnSync('git', ['init', '-q'], { cwd: d });
    mkdirSync(join(repo, 'tools/ci'), { recursive: true });
    writeFileSync(join(repo, 'tools/ci/gate.ts'), '');
    writeFileSync(
      join(bin, 'pnpm'),
      '#!/bin/bash\necho "$*" >> "$FAKE_BIN/calls.log"\ncase "$*" in *"gate:push"*) [ -n "$FAKE_PUSH_RC" ] && exit "$FAKE_PUSH_RC" ;; esac\n[ -n "$FAKE_SLEEP" ] && sleep "$FAKE_SLEEP"\necho "fake gate output"\nexit "$FAKE_RC"\n',
    );
    chmodSync(join(bin, 'pnpm'), 0o755);
  });
  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it.each([
    'git status',
    'echo "git push"',
    'grep -rn push docs',
    'git stash push -m x',
    'cat <<EOF\ngit push origin main\nEOF',
  ])('does not run the gate for: %s', (c) => {
    expect(run(c)).toEqual({ code: 0, out: '', err: '' });
    expect(calls()).toEqual([]);
  });

  it('runs gate:commit --hook only for a real push, stdout empty', () => {
    const r = run('git push origin main');
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
    expect(r.err).toContain('gate:commit ok');
    expect(calls()).toEqual(['run --silent gate:commit --hook']);
  });

  it('honours git -C and cd to the project', () => {
    expect(run(`git -C ${repo} push`, {}, other).code).toBe(0);
    expect(calls().length).toBe(1);
    expect(run(`cd ${repo} && git push`, {}, other).code).toBe(0);
    expect(calls().length).toBe(1);
  });

  it('skips a push in another repository', () => {
    expect(run(`git -C ${other} push`).code).toBe(0);
    expect(calls()).toEqual([]);
  });

  it('blocks when gate:commit fails and shows the log tail', () => {
    const r = run('git push', { FAKE_RC: '2' });
    expect(r.code).toBe(2);
    expect(r.err).toContain('blocked by gate:commit (rc 2)');
    expect(r.err).toContain('fake gate output');
    expect(calls()).toEqual(['run --silent gate:commit --hook']);
  });

  it('blocks a moved-HEAD chain and an unknown directory without running the gate', () => {
    const moved = run('git merge --no-ff x && git push origin main');
    expect([moved.code, calls()]).toEqual([2, []]);
    expect(moved.err).toContain('its own Bash call');
    const unknown = run('git -C "$D" push');
    expect([unknown.code, calls()]).toEqual([2, []]);
    expect(unknown.err).toContain('cannot tell which checkout');
  });

  it('blocks a checkout without the tiered gate', () => {
    const r = run(`git -C ${other} push`, { CLAUDE_PROJECT_DIR: other });
    expect(r.code).toBe(2);
    expect(r.err).toContain('predates the tiered gate');
  });

  it('kills a gate that exceeds the budget', () => {
    const r = run('git push', { TTE_PUSH_HOOK_BUDGET_SEC: '1', FAKE_SLEEP: '30' });
    expect(r.code).toBe(2);
    expect(r.err).toContain('passed the hook budget');
  }, 30000);
});
