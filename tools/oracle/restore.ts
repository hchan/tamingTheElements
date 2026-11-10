// Opt-in: extract the frozen legacy game (war/) from the git tag into the gitignored .oracle/ directory.
// Run: pnpm oracle:restore. The credentials file war/WEB-INF/user.properties is excluded, so it is never written to disk.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const TAG = 'legacy-crafty-1.0';
const root = resolve(import.meta.dirname, '../..');
const out = process.env['TTE_ORACLE_DIR'] ?? resolve(root, '.oracle');
const EXCLUDE = 'war/WEB-INF/user.properties';

try {
  execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${TAG}^{commit}`], { cwd: root, stdio: 'ignore' });
} catch {
  console.error(`tag ${TAG} not found locally. Run: git fetch origin tag ${TAG}`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const archive = spawnSync('git', ['archive', '--format=tar', TAG, 'war'], { cwd: root, maxBuffer: 1 << 30 });
if (archive.status !== 0) {
  console.error(archive.stderr.toString());
  process.exit(1);
}
const tar = spawnSync('tar', ['-x', '--exclude', EXCLUDE, '-C', out], { input: archive.stdout });
if (tar.status !== 0) {
  console.error(tar.stderr.toString());
  process.exit(1);
}
if (existsSync(resolve(out, EXCLUDE))) {
  rmSync(resolve(out, EXCLUDE), { force: true });
  console.error(`removed ${EXCLUDE} (must never be extracted)`);
  process.exit(1);
}
console.log(`restored ${TAG}:war to ${resolve(out, 'war')} (excluding ${EXCLUDE}). Run: pnpm test:oracle`);
