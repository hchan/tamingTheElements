// `pnpm visual:capture | visual:pacing | visual:regress | visual:update`: thin wrapper over
// `playwright test --config playwright.visual.config.ts` (see docs/VISUAL-QA.md).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const MODES: Record<string, readonly string[]> = {
  capture: ['--project=capture', '--project=videos'],
  pacing: ['--project=pacing'],
  regress: ['--project=regression'],
  update: ['--project=regression', '--update-snapshots'],
};

const mode = process.argv[2] ?? '';
const projects = MODES[mode];
if (projects === undefined) {
  console.error(`usage: tsx tools/visual/run.ts <${Object.keys(MODES).join('|')}>`);
  process.exit(2);
}

const out = join(process.cwd(), 'test-results', 'visual');
if (mode === 'capture') {
  rmSync(out, { recursive: true, force: true });
  rmSync(join(process.cwd(), 'test-results', 'visual-run'), { recursive: true, force: true });
}

const r = spawnSync('corepack', ['pnpm', 'exec', 'playwright', 'test', '--config', 'playwright.visual.config.ts', ...projects], {
  stdio: 'inherit',
});

if (mode === 'capture' && existsSync(join(out, 'manifest.json'))) {
  const m = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')) as { entries: { file: string; note: string }[] };
  console.log(`\nvisual:capture wrote ${String(m.entries.length)} screenshots to ${out}`);
  for (const e of m.entries) console.log(`  ${e.file}`);
}
process.exit(r.status ?? 1);
