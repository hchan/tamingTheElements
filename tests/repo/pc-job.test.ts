import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LANES, renderJob, shellQuote, type JobSpec } from '../../tools/ci/pc-job';

let root: string;
beforeEach(() => {
  mkdirSync('.scratch', { recursive: true });
  root = resolve(mkdtempSync(join('.scratch', 'pcjob-')));
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const base = (over: Partial<JobSpec> = {}): JobSpec => ({
  id: '20261118-120000-short-abc123',
  lane: 'short',
  source: { sha: 'a'.repeat(40), ref: 'refs/tte-remote/x', sha256: 'b'.repeat(64), bundle: 'src.bundle' },
  command: ['corepack', 'pnpm', 'e2e', '--', '--grep', 'a b $x'],
  env: { FOO: "it's" },
  fetch: ['.scratch/shots'],
  preflight: true,
  ...over,
});

const bashN = (script: string): void => {
  const f = join(root, 's.sh');
  writeFileSync(f, script);
  const r = spawnSync('bash', ['-n', f], { encoding: 'utf8' });
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
};

describe('renderJob', () => {
  for (const lane of ['short', 'full'] as const) {
    it(`renders valid bash for the ${lane} lane`, () => {
      const { jobSh, startSh } = renderJob(base({ lane, direct: true }));
      bashN(jobSh);
      bashN(startSh);
    });
  }

  it('has the lock, the PC-safe env, the ports and the cleanup', () => {
    const { jobSh } = renderJob(base());
    expect(jobSh).toContain('flock -w 60 9');
    expect(jobSh).toContain('locks/short.lock');
    expect(jobSh).toContain('unset DISPLAY WAYLAND_DISPLAY');
    expect(jobSh).toContain('export TTE_E2E_LOCAL=1');
    expect(jobSh).toContain(`E2E_PORT=${String(LANES.short.port)} E2E_PAGES_PORT=${String(LANES.short.port + 1)}`);
    expect(jobSh).toContain('PLAYWRIGHT_HTML_OPEN=never');
    expect(jobSh).toContain('PLAYWRIGHT_JSON_OUTPUT_FILE=');
    expect(jobSh).toContain('TTE_RESULTS=');
    expect(jobSh).toContain('trap ');
    expect(jobSh).toContain('pkill -f -- "--user-data-dir=$TMPDIR"');
    expect(jobSh).toContain('kill -TERM -- "-$PGID"');
    expect(jobSh).toContain('fail 92');
    expect(jobSh).toContain('fail 95');
    expect(jobSh).toContain('fail 96');
    expect(jobSh).toContain('git bundle verify');
    expect(jobSh).toContain('pc-frame-check.cjs');
    expect(jobSh).toContain(`timeout -k 30 ${String(LANES.short.hardSec)}`);
    expect(jobSh).toContain("export FOO='it'\\''s'");
  });

  it('uses the full lane lock and port', () => {
    const { jobSh } = renderJob(base({ lane: 'full' }));
    expect(jobSh).toContain('locks/full.lock');
    expect(jobSh).toContain(`E2E_PORT=${String(LANES.full.port)} `);
  });

  it('skips the preflight and the bundle in sha mode', () => {
    const { jobSh } = renderJob(base({ preflight: false, source: { sha: 'c'.repeat(40) } }));
    expect(jobSh).not.toContain('pc-frame-check');
    expect(jobSh).not.toContain('bundle verify');
    expect(jobSh).toContain(`'${'c'.repeat(40)}'`);
  });

  it('adds trace, reporter, output and workers only for a direct playwright run', () => {
    const direct = renderJob(base({ direct: true, workers: 2, command: ['corepack', 'pnpm', 'exec', 'playwright', 'test', 'tests/e2e/x.spec.ts'] })).jobSh;
    expect(direct).toContain("'--trace=retain-on-failure'");
    expect(direct).toContain("'--reporter=list,json,html'");
    expect(direct).toContain('"--output=$OUT/test-results"');
    expect(direct).toContain("'--workers=2'");
    expect(renderJob(base()).jobSh).not.toContain('--trace=retain-on-failure');
    expect(renderJob(base({ lane: 'full', direct: true })).jobSh).toContain("'--reporter=dot,json,html'");
  });

  it('waitSec caps the lock wait (default: the lane waitSec)', () => {
    const dflt = renderJob(base()).jobSh;
    expect(dflt).toContain('flock -w 60 9');
    expect(dflt).toContain(`-ge ${String(LANES.short.waitSec)} ]`);
    const capped = renderJob(base({ waitSec: 120 })).jobSh;
    expect(capped).toContain('flock -w 60 9');
    expect(capped).toContain('-ge 120 ]');
    const none = renderJob(base({ waitSec: 0 })).jobSh;
    expect(none).toContain('flock -w 0 9');
    expect(none).toContain('-ge 0 ]');
    bashN(none);
    for (const bad of [-1, 1.5, Number.NaN]) expect(() => renderJob(base({ waitSec: bad }))).toThrow(/bad waitSec/);
  });

  it('records the frame preflight as state/frames-ok or frames-stall', () => {
    const { jobSh } = renderJob(base());
    expect(jobSh).toContain('touch "$BASE/state/frames-ok"');
    expect(jobSh).toContain('touch "$BASE/state/frames-stall"');
    expect(jobSh).toMatch(/frames-stall"; echo "ERROR[^\n]*fail 96/);
    expect(renderJob(base({ preflight: false })).jobSh).not.toContain('state/frames');
  });

  it('rejects unsafe ids and env keys', () => {
    expect(() => renderJob(base({ id: 'a b' }))).toThrow();
    expect(() => renderJob(base({ env: { 'A;B': '1' } }))).toThrow();
  });

  it('round-trips argv through shell quoting', () => {
    const argv = ['--grep', 'a b $x', "it's", '$(touch pwned)', '`x`', '"q"', '', 'a\\b', 'multi\nline'];
    const out = execFileSync('bash', ['-c', `printf '%s\\0' ${argv.map(shellQuote).join(' ')}`], { encoding: 'utf8', cwd: root });
    expect(out.split('\0').slice(0, -1)).toEqual(argv);
    const { jobSh } = renderJob(base({ command: ['x', ...argv] }));
    expect(jobSh).toContain(argv.map(shellQuote).join(' '));
  });

  it('leaks no Mac path, IPv4 address or user@host', () => {
    const src = readFileSync('tools/ci/pc-job.ts', 'utf8') + readFileSync('tools/ci/pc-snapshot.ts', 'utf8');
    const { jobSh, startSh } = renderJob(base({ direct: true }));
    for (const text of [jobSh, startSh, src]) {
      expect(text).not.toMatch(/\/Users\//);
      expect(text).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
      expect(text).not.toMatch(/\b[\w.-]+@[\w-]+\.[\w.-]+/);
    }
  });

  it('start.sh detaches with setsid and supports fg', () => {
    const { startSh } = renderJob(base());
    expect(startSh).toContain('setsid -f bash job.sh');
    expect(startSh).toContain('= fg');
  });
});
