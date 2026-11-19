// Pure decisions for tools/ci/e2e-server.ts (the supervised Playwright webServer), split out like pc-decide.ts so they are
// tested with time passed in: no timers, processes or ports here.
import { join } from 'node:path';

type Env = Readonly<Record<string, string | undefined>>;

export interface Timing {
  /** Probe interval. */
  probeMs: number;
  /** Per-probe request timeout. */
  probeTimeoutMs: number;
  /** Refusals and timeouts this soon after a start are ignored. */
  startupGraceMs: number;
  /** Kill only when this long has passed since the last ok. */
  hangMs: number;
  /** Counted refusals/timeouts in a row needed to kill. */
  strikes: number;
  /** A probe tick this much later than planned is not counted (a starved machine). */
  lagMs: number;
  /** Uptime after which a preview counts as stable. */
  stableMs: number;
  restartMs: number;
  /** After vite exits from SIGTERM, wait this long and re-check whether the supervisor is stopping. */
  termDebounceMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  fastFailLimit: number;
  maxRestarts: number;
  /** stop(): SIGTERM, then SIGKILL after this long. */
  stopGraceMs: number;
}

export const DEFAULT_TIMING: Timing = {
  probeMs: 5_000,
  probeTimeoutMs: 10_000,
  startupGraceMs: 30_000,
  hangMs: 60_000,
  strikes: 4,
  lagMs: 2_000,
  stableMs: 30_000,
  restartMs: 100,
  termDebounceMs: 300,
  backoffBaseMs: 250,
  backoffMaxMs: 15_000,
  fastFailLimit: 20,
  maxRestarts: 50,
  stopGraceMs: 2_000,
};

/** Defaults, overridden by the tests-only TTE_E2E_SERVER_TIMING JSON (validated: known keys, finite non-negative numbers). */
export function timingFrom(env: Env): Timing {
  const raw = env['TTE_E2E_SERVER_TIMING'];
  if (raw === undefined || raw === '') return { ...DEFAULT_TIMING };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('TTE_E2E_SERVER_TIMING is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('TTE_E2E_SERVER_TIMING must be a JSON object');
  const out: Timing = { ...DEFAULT_TIMING };
  for (const [k, v] of Object.entries(parsed)) {
    if (!(k in DEFAULT_TIMING)) throw new Error(`TTE_E2E_SERVER_TIMING: unknown key ${k}`);
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`TTE_E2E_SERVER_TIMING: ${k} must be a non-negative number`);
    out[k as keyof Timing] = v;
  }
  return out;
}

export interface ServerArgs {
  port: string;
  /** vite --mode for the build. */
  mode: string;
  /** Build directory; undefined means the per-checkout default (e2eBuildDir). */
  outDir: string | undefined;
  /** vite --base for build and preview; the probe requests this path. */
  base: string;
}

/** `<port> [--mode m] [--out-dir d] [--base /b/]`; the port may also come from E2E_PORT. Bad input throws. */
export function parseServerArgs(argv: readonly string[], env: Env = {}): ServerArgs {
  let port: string | undefined;
  let mode = 'test';
  let outDir: string | undefined;
  let base = '/';
  const val = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`e2e-server: ${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '--mode') mode = val(i++, a);
    else if (a === '--out-dir') outDir = val(i++, a);
    else if (a === '--base') base = val(i++, a);
    else if (a.startsWith('--')) throw new Error(`e2e-server: unknown flag ${a}`);
    else if (port === undefined) port = a;
    else throw new Error(`e2e-server: unexpected argument ${a}`);
  }
  port ??= env['E2E_PORT'];
  if (port === undefined || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error(`e2e-server: need a port 1-65535 (got ${String(port)})`);
  if (!base.startsWith('/') || !base.endsWith('/')) throw new Error(`e2e-server: --base must start and end with / (got ${base})`);
  return { port, mode, outDir, base };
}

/** Log file: TTE_E2E_SERVER_LOG, else $TTE_RESULTS/e2e-server.log (PC jobs fetch that directory), else .scratch/e2e-server.log. */
export function logPathFor(env: Env): string {
  const explicit = env['TTE_E2E_SERVER_LOG'];
  if (explicit) return explicit;
  const results = env['TTE_RESULTS'];
  if (results) return join(results, 'e2e-server.log');
  return join('.scratch', 'e2e-server.log');
}
