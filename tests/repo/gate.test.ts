import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs as parseRoute } from '../../tools/ci/e2e-route';
import {
  childEnv,
  e2eFingerprint,
  hookMayRunT1,
  isT1Neutral,
  parseArgs,
  parseRanOn,
  pruneList,
  pushVerify,
  refusal,
  routerArgv,
  runPassed,
  runConcurrent,
  summaryLine,
  treeKey,
  UsageError,
} from '../../tools/ci/gate';
import { grepFor, isE2eRelevant, loadDurations, loadRules, selectSpecs } from '../../tools/ci/touched-specs';

const rules = loadRules();

describe('parseArgs', () => {
  it('parses kinds and skips bare --', () => {
    expect(parseArgs(['commit']).kind).toBe('commit');
    expect(parseArgs(['--', 'commit', '--', '--keep-going']).keepGoing).toBe(true);
    const p = parseArgs(['push', '--budget', '600', '--max-tests', '40', '--base', 'main', '--dry-run']);
    expect(p).toMatchObject({ kind: 'push', budget: 600, maxTests: 40, base: 'main', dryRun: true });
    expect(parseArgs(['push', '--explain']).dryRun).toBe(true);
  });
  it('rejects bad input', () => {
    expect(() => parseArgs([])).toThrow(UsageError);
    expect(() => parseArgs(['nope'])).toThrow(UsageError);
    expect(() => parseArgs(['push', '--budget'])).toThrow(UsageError);
    expect(() => parseArgs(['push', '--budget', 'x'])).toThrow(UsageError);
    expect(() => parseArgs(['push', '--bogus'])).toThrow(/unknown flag/);
    expect(() => parseArgs(['push', '--hook'])).toThrow(UsageError);
    expect(() => parseArgs(['commit', '--verify'])).toThrow(UsageError);
  });
});

describe('refusal and childEnv', () => {
  it('names the offending variable', () => {
    expect(refusal({ CI: '1' }, 'pc')).toMatch(/CI/);
    expect(refusal({ TTE_E2E_LOCAL: '1' }, 'pc')).toMatch(/TTE_E2E_LOCAL/);
    expect(refusal({ TTE_ALLOW_MAC_E2E: '1' }, 'pc')).toMatch(/TTE_ALLOW_MAC_E2E/);
    expect(refusal({}, undefined)).toMatch(/no PC configured/);
    expect(refusal({}, 'pc')).toBeUndefined();
  });
  it('strips the forcing variables only', () => {
    const e = childEnv({ CI: '1', TTE_E2E_LOCAL: '1', TTE_ALLOW_MAC_E2E: '1', PATH: '/bin' });
    expect(e).toEqual({ PATH: '/bin' });
  });
});

describe('routerArgv', () => {
  it('is the exact argv with the regex as one element and no forcing flags', () => {
    const a = routerArgv({ specs: ['b.spec.ts', 'a.spec.ts'] });
    expect(a).toEqual(['corepack', 'pnpm', 'exec', 'tsx', 'tools/ci/e2e-route.ts', 'run', '--', '--grep', grepFor(['b.spec.ts', 'a.spec.ts'])]);
    for (const f of ['--pc', '--full', '--pc-lane', '--local']) expect(a).not.toContain(f);
  });
  it('is understood by the router parser as an automatic short run', () => {
    const a = routerArgv({ specs: ['a.spec.ts'] });
    const p = parseRoute(a.slice(5));
    expect(p).toMatchObject({ kind: 'run', mode: 'auto', full: false, rest: ['--grep', a[8]] });
    expect(p.lane).toBeUndefined();
  });
});

describe('parseRanOn', () => {
  it('reads each router line form', () => {
    expect(parseRanOn('x\ne2e ran on: PC (job j-1, short lane) -> exit 0\n')).toMatchObject({ where: 'PC', jobId: 'j-1', code: 0 });
    expect(parseRanOn('e2e ran on: Mac (fallback: pc busy) -> exit 1\n')).toMatchObject({ where: 'Mac', code: 1 });
    expect(parseRanOn('e2e ran on: PC (queue job raw-abc, full lane) -> exit 0\n')).toMatchObject({ where: 'PC', jobId: 'abc' });
    expect(parseRanOn('e2e ran on: nowhere -> exit 89\n')).toMatchObject({ where: 'nowhere', code: 89 });
    expect(parseRanOn('e2e ran on: nowhere (queue job not submitted) -> exit 94\n')).toMatchObject({ where: 'nowhere', code: 94 });
  });
  it('takes the last line and undefined when missing', () => {
    expect(parseRanOn('e2e ran on: nowhere -> exit 89\ne2e ran on: Mac (fallback: x) -> exit 0\n')?.where).toBe('Mac');
    expect(parseRanOn('nothing here')).toBeUndefined();
  });
});

describe('isE2eRelevant', () => {
  it('matches the selector predicate', () => {
    const paths = [
      'docs/TESTING.md',
      'ideas/brainstorm/x.md',
      '.claude/agent-memory/a.md',
      'tools/assets/png-lite.ts',
      'tests/repo/gate.test.ts',
      'tests/e2e/smoke.spec.ts',
      'src/core/sim.ts',
      'tools/ci/touched-specs.json',
      'tools/ci/e2e-durations.json',
      'tools/ci/long-gate-status.json',
    ];
    const opts = { budgetSec: 1200, maxTests: 150, importers: () => [], testsIn: () => 1 };
    for (const p of paths) {
      const sel = selectSpecs([p], rules, loadDurations(), [], opts);
      expect(isE2eRelevant(p, rules), p).toBe(!sel.noE2e);
    }
  });
});

describe('e2eFingerprint', () => {
  const row = (sha: string, path: string): string => `100644 blob ${sha}\t${path}`;
  const base = [row('a1', 'src/game/x.ts'), row('b2', 'docs/a.md')].join('\n');
  it('ignores docs, tracks src and ignores order', () => {
    const fp = e2eFingerprint(base, rules);
    expect(e2eFingerprint(`${base}\n${row('c3', 'docs/new.md')}`, rules)).toBe(fp);
    expect(e2eFingerprint(base.replace('a1', 'a9'), rules)).not.toBe(fp);
    expect(e2eFingerprint(base.split('\n').reverse().join('\n'), rules)).toBe(fp);
  });
});

describe('isT1Neutral', () => {
  it('lists the neutral paths only', () => {
    for (const p of ['tools/ci/long-gate-status.json', 'tools/ci/e2e-durations.json', 'ideas/brainstorm/long-gate-x.md', '.claude/agent-memory/a/b.md']) {
      expect(isT1Neutral(p), p).toBe(true);
    }
    for (const p of ['tools/ci/long-gate-status.ts', 'ideas/brainstorm/other.md', 'src/x.ts']) expect(isT1Neutral(p), p).toBe(false);
  });
});

describe('treeKey', () => {
  let root: string;
  const git = (...args: string[]): string =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' },
    });
  beforeEach(() => {
    mkdirSync('.scratch', { recursive: true });
    root = resolve(mkdtempSync(join('.scratch', 'gate-')));
    git('init', '-q', '-b', 'main');
    writeFileSync(join(root, '.gitignore'), 'ignored.bin\n');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/a.ts'), 'one\n');
    mkdirSync(join(root, '.claude/agent-memory'), { recursive: true });
    writeFileSync(join(root, '.claude/agent-memory/m.md'), 'm\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('is stable across neutral and ignored changes and moves on real ones', () => {
    const head = treeKey(root, 'head');
    expect(treeKey(root, 'worktree')).toBe(head);
    writeFileSync(join(root, '.claude/agent-memory/m.md'), 'changed\n');
    writeFileSync(join(root, 'ignored.bin'), 'x\n');
    expect(treeKey(root, 'worktree')).toBe(head);
    writeFileSync(join(root, 'src/a.ts'), 'two\n');
    const edited = treeKey(root, 'worktree');
    expect(edited).not.toBe(head);
    writeFileSync(join(root, 'src/new.ts'), 'n\n');
    expect(treeKey(root, 'worktree')).not.toBe(edited);
  });
  it('leaves the real index and no temp index behind', () => {
    const before = git('status', '--porcelain=v1');
    writeFileSync(join(root, 'src/new.ts'), 'n\n');
    treeKey(root, 'worktree');
    expect(git('status', '--porcelain=v1')).toBe(`${before}?? src/new.ts\n`);
    const dir = join(root, '.git/tte-gate');
    expect(readdirSync(dir).filter((n) => n.startsWith('index-'))).toEqual([]);
    expect(statSync(dir).mode & 0o077).toBe(0);
  });
});

describe('pushVerify, hookMayRunT1, pruneList, summaryLine', () => {
  const o = { rules, fp: 'abcdef0123', base: '1234567890' };
  it('passes when nothing e2e-relevant changed or a stamp passed', () => {
    expect(pushVerify({ ...o, changed: [], stampPass: false }).ok).toBe(true);
    expect(pushVerify({ ...o, changed: ['docs/a.md'], stampPass: false }).ok).toBe(true);
    expect(pushVerify({ ...o, changed: ['src/core/a.ts'], stampPass: true }).ok).toBe(true);
  });
  it('blocks with the documented message', () => {
    const v = pushVerify({ ...o, changed: ['src/core/a.ts', 'src/game/b.ts', 'docs/a.md'], stampPass: false });
    expect(v.ok).toBe(false);
    expect(v.message).toBe(
      'push blocked: no passing gate:push for abcdef0 (2 e2e-relevant files changed since 1234567). Run: corepack pnpm gate:push (15-30 min; Bash run_in_background), then push again.',
    );
  });
  it('lets the hook run T1 unless the median of the last three is over 600 s', () => {
    expect(hookMayRunT1([])).toBe(true);
    expect(hookMayRunT1([{ totalSec: 900 }, { totalSec: 900 }])).toBe(true);
    expect(hookMayRunT1([{ totalSec: 900 }, { totalSec: 700 }, { totalSec: 100 }])).toBe(false);
    expect(hookMayRunT1([{ totalSec: 900 }, { totalSec: 100 }, { totalSec: 100 }])).toBe(true);
  });
  it('keeps the newest 200 stamps', () => {
    const names = Array.from({ length: 205 }, (_, i) => `commit-${String(i)}.json`);
    expect(pruneList(names)).toEqual(names.slice(200));
    expect(pruneList(names.slice(0, 10))).toEqual([]);
  });
  it('formats the last line', () => {
    expect(summaryLine({ pass: true, specs: 3, tests: 20, estSec: 90, ranOn: 'PC (job j, short lane) -> exit 0' })).toBe(
      'gate:push: pass (3 specs, 20 tests, est 90 s; e2e ran on: PC (job j, short lane) -> exit 0)',
    );
  });
});

describe('T1 neutrality guard', () => {
  it('no host-literal root covers agent-memory and no repo test reads it', () => {
    const src = readFileSync('tests/repo/no-host-literals.test.ts', 'utf8');
    const roots = /const ROOTS = \[(.*?)\];/s.exec(src)?.[1] ?? '';
    for (const r of roots.match(/'[^']+'/g) ?? []) {
      const p = r.slice(1, -1);
      expect('.claude/agent-memory/'.startsWith(`${p}/`) || p.startsWith('.claude/agent-memory'), p).toBe(false);
    }
    for (const f of readdirSync('tests/repo').filter((n) => n.endsWith('.ts'))) {
      if (f === 'gate.test.ts' || f === 'no-host-literals.test.ts') continue;
      expect(readFileSync(join('tests/repo', f), 'utf8').includes('agent-memory'), f).toBe(false);
    }
  });
});

describe('runConcurrent', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gate-conc-'));
    // fake step runner "node step.js <step>": lint is slow, test is fast; FAIL=<step> makes it exit 1
    writeFileSync(
      join(dir, 'step.js'),
      "const s=process.argv[2];const d={lint:400,test:10}[s]??0;setTimeout(()=>{console.log('out-'+s);process.exit(process.env.FAIL===s?1:0)},s===process.env.FAIL?10:d);",
    );
  });
  afterEach(() => {
    delete process.env['FAIL'];
    rmSync(dir, { recursive: true, force: true });
  });
  const run = (): string[] => ['node', join(dir, 'step.js')];

  it('emits output in step order even when the later step finishes first', async () => {
    const seen: string[] = [];
    const res = await runConcurrent(dir, ['lint', 'test'], false, (s, r) => seen.push(`${s}:${r.out.trim()}`), run());
    expect(seen).toEqual(['lint:out-lint', 'test:out-test']);
    expect(res.map((r) => r.code)).toEqual([0, 0]);
  });

  it('a failing step fails the group and the other step is killed (fail-fast)', async () => {
    process.env['FAIL'] = 'test';
    const res = await runConcurrent(dir, ['lint', 'test'], false, () => undefined, run());
    expect(res.find((r) => r.name === 'test')?.code).toBe(1);
    expect(res.find((r) => r.name === 'lint')?.code).toBe(143);
  });

  it('a failing lint still fails the group', async () => {
    process.env['FAIL'] = 'lint';
    const res = await runConcurrent(dir, ['lint', 'test'], true, () => undefined, run());
    expect(res.map((r) => r.code)).toEqual([1, 0]);
  });

  it('keep-going lets both finish', async () => {
    process.env['FAIL'] = 'test';
    const res = await runConcurrent(dir, ['lint', 'test'], true, () => undefined, run());
    expect(res.map((r) => r.code)).toEqual([0, 1]);
  });
});

describe('runPassed', () => {
  it('passes on exit 0 and on a PUSH OK verdict with a failing exit', () => {
    expect(runPassed(0, '')).toBe(true);
    expect(runPassed(1, 'x\nVERDICT: PUSH OK: no new repeating P0/P1 red\nreport: y\n')).toBe(true);
  });
  it('fails on BLOCKED, HOLD, NO VERDICT and a missing verdict line', () => {
    expect(runPassed(1, 'VERDICT: BLOCKED: 1 new repeating red(s)')).toBe(false);
    expect(runPassed(1, 'VERDICT: HOLD: 1 new red(s)')).toBe(false);
    expect(runPassed(1, 'VERDICT: NO VERDICT: the run did not finish')).toBe(false);
    expect(runPassed(1, 'PUSH OK mentioned mid-line, no verdict')).toBe(false);
    expect(runPassed(1, '')).toBe(false);
  });
});
