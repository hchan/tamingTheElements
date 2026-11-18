import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isGateNeutralPath, parseCliArgs, pathsBeyondLongGate } from '../../tools/ci/deploy-pages';

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

describe('ci.yml long gate wiring', () => {
  it('runs the verdict step with the ignore input', () => {
    expect(ci).toMatch(/id: verdict\n\s+env:\n\s+IGNORE_LONG_GATE: \$\{\{ inputs\.ignore_long_gate \}\}\n\s+run: corepack pnpm exec tsx tools\/ci\/long-gate-verdict\.ts --github-output/);
    expect(ci).toMatch(/ignore_long_gate:\n(\s+.*\n)*?\s+type: boolean\n\s+default: false/);
  });
  it('checks out lastGood only when it differs from the current sha', () => {
    expect(ci).toMatch(/steps\.verdict\.outputs\.deploy == 'true' && steps\.verdict\.outputs\.sha != github\.sha/);
    expect(ci).toMatch(/git checkout --detach "\$SHA"/);
  });
  it('gates the build, the upload and the deploy job on the verdict', () => {
    expect(ci).toMatch(/outputs:\n\s+deploy: \$\{\{ steps\.verdict\.outputs\.deploy \}\}/);
    expect(ci).toMatch(/name: Build for Pages\n\s+if: steps\.verdict\.outputs\.deploy == 'true'/);
    expect(ci).toMatch(/- if: steps\.verdict\.outputs\.deploy == 'true'\n\s+uses: actions\/upload-pages-artifact@/);
    expect(ci).toMatch(/if: github\.ref == 'refs\/heads\/main' && needs\.pages-build\.outputs\.deploy == 'true'/);
  });
  it('runs at 14:00 UTC', () => {
    expect(ci).toMatch(/cron: '0 14 \* \* \*'/);
  });
  it('never runs e2e on Actions and keeps actions pinned by sha', () => {
    expect(ci).not.toMatch(/playwright test|pnpm e2e/);
    for (const m of ci.matchAll(/uses: (\S+)@(\S+)/g)) expect(m[2]).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('deploy-pages long gate options', () => {
  it('parses --ignore-long-gate and leaves the default shape unchanged', () => {
    expect(parseCliArgs([])).toEqual({ dryRun: false, branch: 'gh-pages' });
    expect(parseCliArgs(['--ignore-long-gate', '--dry-run'])).toEqual({ dryRun: true, branch: 'gh-pages', ignoreLongGate: true });
  });
  it('allows only the status file and ideas after lastGood', () => {
    expect(isGateNeutralPath('tools/ci/long-gate-status.json')).toBe(true);
    expect(isGateNeutralPath('ideas/brainstorm/x.md')).toBe(true);
    expect(isGateNeutralPath('src/core/index.ts')).toBe(false);
    expect(pathsBeyondLongGate(['tools/ci/long-gate-status.json', 'ideas/done/a.md', ''])).toEqual([]);
    expect(pathsBeyondLongGate(['ideas/a.md', 'docs/X.md'])).toEqual(['docs/X.md']);
  });
});
