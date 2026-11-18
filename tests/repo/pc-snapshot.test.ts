import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planSource, type SourcePlan } from '../../tools/ci/pc-snapshot';

let root: string;
let work: string;

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' },
  });

beforeEach(() => {
  mkdirSync('.scratch', { recursive: true });
  root = resolve(mkdtempSync(join('.scratch', 'snap-')));
  const origin = join(root, 'origin.git');
  work = join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'checkout', '-q', '-b', 'main');
  writeFileSync(join(work, '.gitignore'), '.scratch\nnode_modules\nbig-ignored.bin\n');
  writeFileSync(join(work, 'a.txt'), 'one\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'init');
  git(work, 'push', '-q', 'origin', 'main');
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const snap = (p: SourcePlan): { bundle: string; ref: string } => {
  if (!p.bundle || !p.ref) throw new Error('expected a snapshot plan');
  return { bundle: p.bundle, ref: p.ref };
};

describe('planSource', () => {
  it('uses the sha for a clean tree on origin/main', () => {
    const p = planSource(work, 'j1');
    expect(p.sha).toBe(git(work, 'rev-parse', 'HEAD').trim());
    expect(p.bundle).toBeUndefined();
    expect(p.bytes).toBe(0);
  });

  it('bundles a dirty tree with untracked files; HEAD, index and tree stay untouched', () => {
    writeFileSync(join(work, 'a.txt'), 'two\n');
    writeFileSync(join(work, 'new.spec.ts'), 'x\n');
    writeFileSync(join(work, 'staged.txt'), 's\n');
    git(work, 'add', 'staged.txt');
    const head = git(work, 'rev-parse', 'HEAD');
    const status = git(work, 'status', '--porcelain=v1');
    const indexTree = git(work, 'write-tree');
    const p = planSource(work, 'j2');
    expect(p.bundle && existsSync(p.bundle)).toBe(true);
    expect(p.ref).toBe('refs/tte-remote/j2');
    expect(p.bytes).toBeGreaterThan(0);
    expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(git(work, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(work, 'status', '--porcelain=v1')).toBe(status);
    expect(git(work, 'write-tree')).toBe(indexTree);
    expect(git(work, 'for-each-ref', 'refs/tte-remote').trim()).toBe('');
    expect(git(work, 'show', `${p.sha}:a.txt`)).toBe('two\n');
    expect(git(work, 'show', `${p.sha}:new.spec.ts`)).toBe('x\n');
    expect(git(work, 'rev-parse', `${p.sha}^`)).toBe(head);
  });

  it('produces a bundle a second clone can verify and fetch', () => {
    writeFileSync(join(work, 'new.txt'), 'n\n');
    const p = planSource(work, 'j3');
    const second = join(root, 'second');
    git(root, 'clone', '-q', join(root, 'origin.git'), second);
    const { bundle, ref } = snap(p);
    git(second, 'bundle', 'verify', bundle);
    git(second, 'fetch', '-q', bundle, `${ref}:${ref}`);
    git(second, 'checkout', '-q', '--detach', p.sha);
    expect(readFileSync(join(second, 'new.txt'), 'utf8')).toBe('n\n');
  });

  it('keeps unpushed commits reachable from the bundle', () => {
    writeFileSync(join(work, 'b.txt'), 'b\n');
    git(work, 'add', 'b.txt');
    git(work, 'commit', '-q', '-m', 'local');
    const p = planSource(work, 'j4');
    const { bundle, ref } = snap(p);
    const second = join(root, 'second');
    git(root, 'clone', '-q', join(root, 'origin.git'), second);
    git(second, 'fetch', '-q', bundle, `${ref}:${ref}`);
    expect(git(second, 'show', `${p.sha}:b.txt`)).toBe('b\n');
  });

  it('refuses a bundle over the cap and names the biggest untracked files', () => {
    writeFileSync(join(work, 'huge.bin'), Buffer.alloc(200_000, 7).map((_, i) => (i * 31) % 251));
    expect(() => planSource(work, 'j5', { maxBytes: 1000 })).toThrow(/huge\.bin/);
    expect(existsSync(join(work, '.scratch', 'remote-e2e', 'j5', 'src.bundle'))).toBe(false);
    expect(git(work, 'for-each-ref', 'refs/tte-remote').trim()).toBe('');
  });

  it('adds ignored paths only with include', () => {
    writeFileSync(join(work, 'big-ignored.bin'), 'ig\n');
    git(work, 'status', '--porcelain');
    const plain = planSource(work, 'j6');
    expect(plain.bundle).toBeUndefined();
    const inc = planSource(work, 'j7', { include: ['big-ignored.bin'] });
    expect(git(work, 'show', `${inc.sha}:big-ignored.bin`)).toBe('ig\n');
    writeFileSync(join(work, 'x.txt'), 'x\n');
    const dirty = planSource(work, 'j8');
    expect(() => git(work, 'show', `${dirty.sha}:big-ignored.bin`)).toThrow();
  });

  it('rejects unsafe ids', () => {
    expect(() => planSource(work, 'a/b')).toThrow(/bad job id/);
  });
});
