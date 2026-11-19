import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collect, main, readStatus, status, submit, type Deps, type RunResult } from '../../tools/ci/nightly-e2e';

const SHA = 'b'.repeat(40);
let dir: string;
let calls: { cmd: string; args: string[]; env: Record<string, string | undefined> }[];
let out: string;
let err: string;

function deps(run: (cmd: string, args: readonly string[]) => RunResult, env: Record<string, string> = {}): Deps {
  return {
    env,
    repo: join(dir, 'repo'),
    statusDir: join(dir, 'gate'),
    now: () => new Date('2026-11-20T06:00:00Z'),
    run: (cmd, args, _cwd, e) => {
      calls.push({ cmd, args: [...args], env: { ...e } });
      return run(cmd, args);
    },
    out: (s) => {
      out += s;
    },
    err: (s) => {
      err += s;
    },
  };
}
const ok = (stdout = '', stderr = ''): RunResult => ({ code: 0, stdout, stderr });

beforeEach(() => {
  mkdirSync(resolve('.scratch'), { recursive: true });
  dir = mkdtempSync(join(resolve('.scratch'), 'nightly-test-'));
  mkdirSync(join(dir, 'repo', '.scratch', 'nightly-wt'), { recursive: true });
  calls = [];
  out = '';
  err = '';
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const submitRun = (routerCode = 0) => (cmd: string, args: readonly string[]): RunResult => {
  if (cmd === 'git' && args[0] === 'rev-parse') return ok(`${SHA}\n`);
  if (cmd === 'corepack') return { code: routerCode, stdout: 'detached: pnpm e2e:remote -- --pc-attach raw-9 | --pc-cancel raw-9\n', stderr: routerCode === 0 ? 'queued raw-9 in cpu-full\n' : 'PC unreachable\n' };
  return ok();
};

describe('nightly-e2e submit', () => {
  it('queues the full suite on the PC and records pending', () => {
    expect(submit(deps(submitRun()))).toBe(0);
    const router = calls.find((c) => c.cmd === 'corepack');
    expect(router?.args).toEqual(expect.arrayContaining(['run', '--full', '--pc-detach']));
    expect(router?.env['TTE_E2E_VIA_QUEUE']).toBe('1');
    expect(router?.args.join(' ')).not.toMatch(/--local/);
    expect(readStatus(join(dir, 'gate'))).toMatchObject({ state: 'pending', sha: SHA, rawId: 'raw-9' });
  });
  it('tests the tip of local main (unpushed commits included), not origin/main', () => {
    submit(deps(submitRun()));
    const revParse = calls.find((c) => c.cmd === 'git' && c.args[0] === 'rev-parse');
    expect(revParse?.args).toEqual(['rev-parse', 'main']);
  });
  it('records not-run (never pass) when the PC is unreachable', () => {
    expect(submit(deps(submitRun(94)))).toBe(0);
    expect(readStatus(join(dir, 'gate'))?.state).toBe('not-run');
    expect(err).toContain('not-run');
  });
  it('refuses with a Mac-forcing or CI env and touches nothing', () => {
    for (const k of ['CI', 'TTE_E2E_LOCAL', 'TTE_ALLOW_MAC_E2E']) expect(submit(deps(submitRun(), { [k]: '1' }))).toBe(2);
    expect(calls).toHaveLength(0);
    expect(readStatus(join(dir, 'gate'))).toBeUndefined();
  });
});

describe('nightly-e2e collect', () => {
  const seedPending = (): void => {
    submit(deps(submitRun()));
    calls = [];
  };
  const attachRun = (code: number, results?: unknown) => (cmd: string, args: readonly string[]): RunResult => {
    if (cmd !== 'corepack') return ok();
    const to = calls[calls.length - 1]?.env['PLAYWRIGHT_JSON_OUTPUT_FILE'];
    if (results !== undefined && to) writeFileSync(to, JSON.stringify(results));
    expect(args).toContain('--pc-attach');
    return { code, stdout: '', stderr: `e2e ran on: PC (queue job raw-9, full lane) -> exit ${String(code)}\n` };
  };
  it('records red with failing tests', () => {
    seedPending();
    const results = { suites: [{ file: 'a.spec.ts', specs: [{ title: 'boom', file: 'a.spec.ts', tests: [{ status: 'unexpected' }] }] }] };
    collect(deps(attachRun(1, results)));
    const s = readStatus(join(dir, 'gate'));
    expect(s?.state).toBe('red');
    expect(s?.failed).toEqual([{ file: 'a.spec.ts', title: 'boom' }]);
    expect(s?.ranOn).toContain('PC');
    expect(readFileSync(join(dir, 'gate', 'nightly-history.jsonl'), 'utf8').split('\n').filter(Boolean)).toHaveLength(2);
  });
  it('records pass on exit 0 with results, not-run without', () => {
    seedPending();
    collect(deps(attachRun(0, { suites: [{ file: 'a', specs: [{ title: 't', file: 'a', tests: [{ status: 'expected' }] }] }] })));
    expect(readStatus(join(dir, 'gate'))?.state).toBe('pass');
    seedPending();
    collect(deps(attachRun(94)));
    const s = readStatus(join(dir, 'gate'));
    expect(s?.state).toBe('not-run');
    expect(s?.reason).toBe('PC unreachable');
  });
  it('does nothing without a pending job; status never fails', () => {
    expect(collect(deps(() => ok()))).toBe(0);
    expect(calls).toHaveLength(0);
    expect(status(deps(() => ok()))).toBe(0);
    expect(out).toContain('not-run');
    mkdirSync(join(dir, 'gate'), { recursive: true });
    writeFileSync(join(dir, 'gate', 'nightly-status.json'), '{corrupt');
    expect(main(['--', 'status'], deps(() => ok()))).toBe(0);
    expect(main(['bogus'], deps(() => ok()))).toBe(2);
  });
});
