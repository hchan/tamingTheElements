import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { validateStatus, verdict } from '../../tools/ci/long-gate-status';
import { annotation, ignoreFlag, outputLines, parseCliArgs, STATUS_PATH, summaryMarkdown } from '../../tools/ci/long-gate-verdict';

const HEAD = 'a'.repeat(40);

describe('long-gate-verdict', () => {
  it('parses flags and rejects unknown ones', () => {
    const o = parseCliArgs(['--now', '2026-11-18T00:00:00Z', '--max-age-hours', '12', '--github-output']);
    expect(o).toEqual({ now: new Date('2026-11-18T00:00:00Z'), maxAgeHours: 12, githubOutput: true });
    expect(parseCliArgs([], () => new Date(0)).maxAgeHours).toBe(36);
    expect(() => parseCliArgs(['--bogus'])).toThrow(/Unknown argument/);
    expect(() => parseCliArgs(['--now', 'x'])).toThrow(/ISO/);
    expect(() => parseCliArgs(['--max-age-hours', '0'])).toThrow();
  });
  it('ignores the gate only for the exact string true', () => {
    expect(ignoreFlag('true')).toBe(true);
    for (const v of [undefined, '', 'false', 'TRUE', '1']) expect(ignoreFlag(v)).toBe(false);
  });
  it('the committed seed is valid and shadow: deploys HEAD with a warning', () => {
    const seed = JSON.parse(readFileSync(STATUS_PATH, 'utf8')) as unknown;
    expect(validateStatus(seed).ok).toBe(true);
    expect(seed).toEqual({ schema: 1, enforce: false });
    const v = verdict(seed, { now: new Date(), maxAgeHours: 36, ignore: false, headSha: HEAD, isAncestor: () => true });
    expect(outputLines(v)).toEqual(['deploy=true', `sha=${HEAD}`, expect.stringMatching(/^reason=shadow mode/)]);
    expect(annotation(v)).toMatch(/^::warning::/);
    expect(summaryMarkdown(v)).toContain('**true**');
  });
  it('output lines are single-line', () => {
    const lines = outputLines({ deploy: false, sha: '', reason: 'a\nb', level: 'warning', fail: false });
    expect(lines).toEqual(['deploy=false', 'sha=', 'reason=a b']);
  });

  describe('CLI', () => {
    mkdirSync('.scratch', { recursive: true });
    const dir = mkdtempSync(join('.scratch', 'verdict-'));
    afterAll(() => { rmSync(dir, { recursive: true, force: true }); });
    const runCli = (env: Record<string, string>) =>
      spawnSync('corepack', ['pnpm', 'exec', 'tsx', 'tools/ci/long-gate-verdict.ts', '--github-output'], { env: { ...process.env, ...env }, encoding: 'utf8' });

    it('writes GITHUB_OUTPUT and the summary, exit 0 in shadow mode', () => {
      const out = join(dir, 'out.txt');
      const sum = join(dir, 'sum.md');
      const r = runCli({ GITHUB_SHA: HEAD, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: sum, IGNORE_LONG_GATE: '' });
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/^::warning::/);
      expect(readFileSync(out, 'utf8')).toMatch(new RegExp(`^deploy=true\\nsha=${HEAD}\\nreason=shadow mode`));
      expect(readFileSync(sum, 'utf8')).toContain('Long gate verdict');
    }, 60_000);
    it('rejects a non-hex GITHUB_SHA with exit 1', () => {
      expect(runCli({ GITHUB_SHA: 'main' }).status).toBe(1);
    }, 60_000);
  });
});
