// `pnpm deploy:pages [--dry-run]`: publish the Pages build to the `gh-pages` branch without GitHub Actions.
// Force-push is allowed for this one branch only; the target is hard-coded and anything else is refused.
// See docs/DEPLOYMENT.md "Deploying without GitHub Actions".
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PAGES_BRANCH = 'gh-pages';
export const BUILD_DIR = 'dist-pages';

export interface Options {
  readonly dryRun: boolean;
  readonly branch: string;
}

/** Only `--dry-run` is meaningful; `--branch` exists so that any target other than gh-pages is refused loudly. */
export function parseCliArgs(argv: readonly string[]): Options {
  let dryRun = false;
  let branch = PAGES_BRANCH;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--branch') branch = argv[++i] ?? '';
    else if (a?.startsWith('--branch=')) branch = a.slice('--branch='.length);
    else throw new Error(`Unknown argument: ${String(a)} (usage: deploy:pages [--dry-run])`);
  }
  assertPagesBranch(branch);
  return { dryRun, branch };
}

export function assertPagesBranch(branch: string): void {
  if (branch !== PAGES_BRANCH) throw new Error(`Refusing to deploy to "${branch}": only "${PAGES_BRANCH}" may be force-pushed.`);
}

/** `git status --porcelain` output; any content means a dirty tree. */
export function assertCleanTree(porcelain: string): void {
  if (porcelain.trim() !== '') throw new Error('Refusing to deploy: working tree is dirty. Commit or discard changes first.');
}

/** `isAncestor` is the result of `git merge-base --is-ancestor HEAD origin/main`. */
export function assertPushed(isAncestor: boolean): void {
  if (!isAncestor) throw new Error('Refusing to deploy: HEAD is not pushed to origin/main.');
}

export const commitMessage = (sha: string, version: string): string => `Deploy ${sha} (${version})`;

export function pushArgs(branch: string): string[] {
  assertPagesBranch(branch);
  return ['push', '--force', 'origin', `HEAD:${PAGES_BRANCH}`];
}

function git(args: string[], cwd?: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

function run(cmd: string[], cwd?: string): void {
  const r = spawnSync(cmd[0] as string, cmd.slice(1), { cwd, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd.join(' ')} failed (exit ${String(r.status)})`);
}

function main(): void {
  const opts = parseCliArgs(process.argv.slice(2));
  assertCleanTree(git(['status', '--porcelain']));
  git(['fetch', 'origin', 'main']);
  assertPushed(spawnSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']).status === 0);
  const sha = git(['rev-parse', '--short', 'HEAD']);
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

  // e2e:pages builds dist-pages with VITE_BASE=/tamingTheElements/ (same as the workflow) and smoke-tests it.
  run(['corepack', 'pnpm', 'e2e:pages']);
  if (!existsSync(join(BUILD_DIR, 'index.html'))) throw new Error(`${BUILD_DIR}/index.html missing after build.`);

  const scratch = join(homedir(), 'claudetmp');
  mkdirSync(scratch, { recursive: true });
  const tmp = mkdtempSync(join(scratch, 'gh-pages-'));
  try {
    cpSync(BUILD_DIR, tmp, { recursive: true });
    writeFileSync(join(tmp, '.nojekyll'), '');
    git(['init', '-q', '-b', PAGES_BRANCH], tmp);
    git(['add', '-A', '-f'], tmp);
    git(['-c', 'user.name=Pages deploy', '-c', 'user.email=noreply@users.noreply.github.com', 'commit', '-q', '-m', commitMessage(sha, version)], tmp);
    console.log(git(['show', '--stat', '--format=%s', 'HEAD'], tmp).split('\n').slice(0, 15).join('\n'));
    const origin = git(['remote', 'get-url', 'origin']);
    if (opts.dryRun) {
      console.log(`\ndeploy:pages --dry-run: would run \`git ${pushArgs(opts.branch).join(' ')}\` against ${origin}. Nothing pushed.`);
      return;
    }
    git(['remote', 'add', 'origin', origin], tmp);
    run(['git', ...pushArgs(opts.branch)], tmp);
    console.log(`\nPublished ${commitMessage(sha, version)} to origin/${PAGES_BRANCH}.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
