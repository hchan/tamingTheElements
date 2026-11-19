import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMING, logPathFor, parseServerArgs, timingFrom } from '../../tools/ci/e2e-server-policy';

describe('e2e-server policy: arguments, timing, log path', () => {
  it('parseServerArgs takes a positional port and the pages flags', () => {
    expect(parseServerArgs(['7001'])).toEqual({ port: '7001', mode: 'test', outDir: undefined, base: '/' });
    expect(parseServerArgs(['7002', '--mode', 'production', '--out-dir', 'dist-pages', '--base', '/tamingTheElements/'])).toEqual({
      port: '7002',
      mode: 'production',
      outDir: 'dist-pages',
      base: '/tamingTheElements/',
    });
    expect(parseServerArgs([], { E2E_PORT: '7003' }).port).toBe('7003');
  });

  it('parseServerArgs rejects bad input', () => {
    expect(() => parseServerArgs([])).toThrow(/port/);
    expect(() => parseServerArgs(['abc'])).toThrow(/port/);
    expect(() => parseServerArgs(['70000'])).toThrow(/port/);
    expect(() => parseServerArgs(['7001', '7002'])).toThrow(/unexpected/);
    expect(() => parseServerArgs(['7001', '--nope'])).toThrow(/unknown flag/);
    expect(() => parseServerArgs(['7001', '--mode'])).toThrow(/needs a value/);
    expect(() => parseServerArgs(['7001', '--base', 'x'])).toThrow(/--base/);
  });

  it('timingFrom returns the defaults and validates the tests-only override', () => {
    expect(timingFrom({})).toEqual(DEFAULT_TIMING);
    expect(timingFrom({ TTE_E2E_SERVER_TIMING: '{"probeMs":100}' }).probeMs).toBe(100);
    expect(() => timingFrom({ TTE_E2E_SERVER_TIMING: '{' })).toThrow(/JSON/);
    expect(() => timingFrom({ TTE_E2E_SERVER_TIMING: '[]' })).toThrow(/object/);
    expect(() => timingFrom({ TTE_E2E_SERVER_TIMING: '{"bogus":1}' })).toThrow(/unknown key/);
    expect(() => timingFrom({ TTE_E2E_SERVER_TIMING: '{"probeMs":-1}' })).toThrow(/non-negative/);
    expect(() => timingFrom({ TTE_E2E_SERVER_TIMING: '{"probeMs":"x"}' })).toThrow(/non-negative/);
  });

  it('logPathFor: explicit path, then TTE_RESULTS, then .scratch', () => {
    expect(logPathFor({ TTE_E2E_SERVER_LOG: 'a/b.log', TTE_RESULTS: 'r' })).toBe('a/b.log');
    expect(logPathFor({ TTE_RESULTS: 'r' })).toBe('r/e2e-server.log');
    expect(logPathFor({})).toBe('.scratch/e2e-server.log');
  });
});
