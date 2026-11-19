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

/** Plain-words reading of how vite ended. 143 is vite's own SIGTERM handler, so the signal came from outside. */
export function describeExit(code: number | null, signal: string | null): string {
  if (signal === 'SIGKILL') return 'signal SIGKILL (killed from outside: the OS out-of-memory killer or kill -9)';
  if (signal !== null) return `signal ${signal}`;
  if (code === 143) return 'exit 143 (SIGTERM handled by vite, sent from outside: pkill or a tool)';
  if (code === 130) return 'exit 130 (SIGINT)';
  return `exit ${String(code)}`;
}

/** What vite's stderr says went wrong, if recognisable. */
export function classifyStderr(text: string): 'port in use' | 'file vanished (ENOENT)' | 'too many open files' | undefined {
  if (/Port \d+ is already in use|EADDRINUSE/i.test(text)) return 'port in use';
  if (/EMFILE|too many open files/i.test(text)) return 'too many open files';
  if (/ENOENT/.test(text)) return 'file vanished (ENOENT)';
  return undefined;
}

export interface RestartState {
  /** How long the preview that just exited had been up. */
  uptimeMs: number;
  /** Consecutive fast failures before this exit. */
  fastFails: number;
  /** Restarts so far, before this exit. */
  restarts: number;
  /** It ended from SIGTERM (something outside sent it). */
  sigterm: boolean;
}
export type RestartDecision =
  | { action: 'restart'; delayMs: number; fastFails: number; restarts: number }
  | { action: 'give up'; why: string; fastFails: number; restarts: number };

/**
 * What to do after an unexpected exit. A stable preview (up at least stableMs) restarts quickly and resets the failure count;
 * a fast failure backs off (base * 2^(n-1), capped); too many fast failures in a row, or too many restarts, gives up.
 */
export function restartDecision(s: RestartState, t: Timing): RestartDecision {
  const restarts = s.restarts + 1;
  const stable = s.uptimeMs >= t.stableMs;
  const fastFails = stable ? 0 : s.fastFails + 1;
  if (restarts > t.maxRestarts) return { action: 'give up', why: `more than ${String(t.maxRestarts)} restarts in total`, fastFails, restarts };
  if (fastFails >= t.fastFailLimit) return { action: 'give up', why: `${String(fastFails)} fast failures in a row`, fastFails, restarts };
  const backoff = stable ? t.restartMs : Math.min(t.backoffBaseMs * 2 ** (fastFails - 1), t.backoffMaxMs);
  const delayMs = s.sigterm ? Math.max(backoff, t.termDebounceMs) : backoff;
  return { action: 'restart', delayMs, fastFails, restarts };
}

/** `lsof -Fpc` output: p<pid> then c<command> per process. */
export function parseLsof(out: string): { pid: number; command: string }[] {
  const res: { pid: number; command: string }[] = [];
  let cur: { pid: number; command: string } | undefined;
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) {
      const pid = Number(line.slice(1));
      cur = Number.isInteger(pid) ? { pid, command: '' } : undefined;
      if (cur) res.push(cur);
    } else if (line.startsWith('c') && cur) cur.command = line.slice(1);
  }
  return res;
}
