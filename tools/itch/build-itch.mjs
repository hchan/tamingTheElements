// Builds the itch.io HTML5 zip: relative-base Vite build, size check, then `zip` (macOS/Linux) into dist-itch/.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Budgets: itch's hard limits are 1000 files, 500 MB extracted, 200 MB per file, 240 chars per path.
// Ours are far tighter so growth is noticed long before the platform limit. Documented in docs/DEPLOYMENT.md.
export const BUDGET = { files: 500, totalBytes: 40 * 1024 * 1024, fileBytes: 20 * 1024 * 1024, pathChars: 200 };

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const out = join(root, 'dist-itch');
const site = join(out, 'site');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** Returns a list of problems (empty = within budget and layout is valid). */
export function checkSite(dir) {
  const problems = [];
  const files = walk(dir);
  let total = 0;
  for (const f of files) {
    const size = statSync(f).size;
    const rel = relative(dir, f);
    total += size;
    if (size > BUDGET.fileBytes) problems.push(`${rel}: ${size} bytes exceeds per-file budget ${BUDGET.fileBytes}`);
    if (rel.length > BUDGET.pathChars) problems.push(`${rel}: path longer than ${BUDGET.pathChars} chars`);
  }
  if (!files.some((f) => relative(dir, f) === 'index.html')) problems.push('index.html is not at the zip root');
  if (files.length > BUDGET.files) problems.push(`${files.length} files exceeds budget ${BUDGET.files}`);
  if (total > BUDGET.totalBytes) problems.push(`${total} bytes exceeds total budget ${BUDGET.totalBytes}`);
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  if (/(?:src|href)="\/(?!\/)/.test(html)) problems.push('index.html has root-absolute URLs (needs VITE_BASE=./)');
  return { problems, files: files.length, total };
}

function main() {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  execFileSync('corepack', ['pnpm', 'exec', 'vite', 'build', '--outDir', site, '--emptyOutDir'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE: './' },
  });
  const { problems, files, total } = checkSite(site);
  console.log(`itch site: ${files} files, ${(total / 1048576).toFixed(2)} MiB`);
  if (problems.length > 0) {
    console.error(problems.map((p) => `FAIL ${p}`).join('\n'));
    process.exit(1);
  }
  const zip = join(out, `taming-the-elements-${version}.zip`);
  execFileSync('zip', ['-q', '-r', '-X', zip, '.'], { cwd: site, stdio: 'inherit' });
  console.log(`wrote ${relative(root, zip)} (${(statSync(zip).size / 1048576).toFixed(2)} MiB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
