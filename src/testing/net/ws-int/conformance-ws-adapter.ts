import { parseArgs } from 'node:util';
import { decodeText } from '../../../core/relay';
import {
  conformanceCases,
  runAll,
  type ConformanceAdapter,
  type ConformanceClient,
  type ConformanceHooks,
  type ConformanceReport,
} from '../../../core/relay/conformance';

/**
 * The conformance suite (`@tamingtheelements/relay/conformance`) over real WebSockets, driven by `tools/relay-conformance/run.ts`.
 * The target is the base URL in the env var `TTE_RELAY_URL` only; it is never logged beyond what the user typed. The run is read-only
 * apart from normal session, ticket and WebSocket traffic. Hooks without a remote equivalent (`setResting`, `advanceTime`) are left
 * out, so those cases report `skip`.
 */

/** Tunables. Each value is a contract value (fixed by a spec or the work package), a choice, or an estimate. */
export const CONF = {
  /** [contract] The only place the target comes from. */
  urlEnv: 'TTE_RELAY_URL',
  /** [contract, per work package] Max frames per second per connection the backend accepts. */
  rateLimitFramesPerSec: 200,
  /** [choice] Send at no more than this share of the limit. */
  rateSafetyFactor: 2,
  /** [choice] Default wait for an expected frame, real ms (also the connect and ticket timeout). Raise it for a Lambda cold start. */
  defaultTimeoutMs: 5000,
  /** [choice] Default quiet period for "must not arrive" asserts, real ms. */
  defaultSettleMs: 500,
  /** [choice] Longest gateway notice text kept in the report. */
  noticeMaxChars: 80,
  /** [choice] Exit codes of the CLI. */
  exit: { ok: 0, caseFailed: 1, badConfig: 2, neverConnected: 3 },
} as const;

export interface Delivery {
  /** Text messages that decoded as frames. */
  text: number;
  /** Binary messages (the contract is text only). */
  binary: number;
  /** Text messages that are not frames (gateway notices), redacted. */
  notices: string[];
}

export interface WsConformanceDeps {
  readonly fetch?: typeof fetch;
  readonly WebSocket?: new (url: string) => WebSocket;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface WsConformanceOptions {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly settleMs: number;
  /** Binary ASCII frames fail the case instead of being passed on as text. */
  readonly strictText: boolean;
  readonly deps?: WsConformanceDeps;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

/** The text of a notice with ids dropped: only the `message` of a JSON body, else a clipped plain phrase. */
export function redactNotice(text: string): string {
  try {
    const j: unknown = JSON.parse(text);
    if (typeof j === 'object' && j !== null && typeof (j as { message?: unknown }).message === 'string') {
      return (j as { message: string }).message.slice(0, CONF.noticeMaxChars);
    }
  } catch { /* plain text */ }
  return text.slice(0, CONF.noticeMaxChars);
}

export function createWsConformance(o: WsConformanceOptions): {
  adapter: ConformanceAdapter;
  hooks: ConformanceHooks;
  stats: Delivery & { connected: number; connectFailures: number };
} {
  const d = o.deps ?? {};
  const doFetch = d.fetch ?? fetch;
  const Ws = d.WebSocket ?? WebSocket;
  const now = d.now ?? ((): number => performance.now());
  const sleep = d.sleep ?? realSleep;
  const gapMs = Math.ceil((1000 / CONF.rateLimitFramesPerSec) * CONF.rateSafetyFactor);
  const stats = { text: 0, binary: 0, notices: [] as string[], connected: 0, connectFailures: 0 };

  const post = async (path: string, body: unknown, bearer?: string): Promise<Record<string, unknown>> => {
    const res = await doFetch(`${o.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(bearer === undefined ? {} : { Authorization: `Bearer ${bearer}` }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(o.timeoutMs),
    });
    if (res.status < 200 || res.status > 299) throw new Error(`${path}: HTTP ${String(res.status)}`);
    return (await res.json()) as Record<string, unknown>;
  };

  const open = async (): Promise<ConformanceClient> => {
    const session = (await post('/session', { kind: 'guest' }))['session'];
    if (typeof session !== 'string' || session === '') throw new Error('/session: no session token');
    const url = (await post('/ticket', undefined, session))['url'];
    if (typeof url !== 'string' || !url.startsWith('wss://')) throw new Error('/ticket: no wss url');
    const ws = new Ws(url);
    ws.binaryType = 'arraybuffer';
    let onText: ((t: string) => void) | undefined;
    let onClose: ((c: number) => void) | undefined;
    const early: string[] = [];
    let closed: number | undefined;
    const deliver = (t: string): void => { if (onText) onText(t); else early.push(t); };
    ws.addEventListener('message', (ev) => {
      const data: unknown = ev.data;
      if (typeof data === 'string') {
        if (decodeText(data) === undefined) stats.notices.push(redactNotice(data));
        else stats.text++;
        deliver(data);
      } else {
        stats.binary++;
        // strict: an empty text is no frame, so the case that waited for one fails
        deliver(o.strictText ? '' : Buffer.from(data as ArrayBuffer).toString('latin1'));
      }
    });
    ws.addEventListener('close', (ev) => { closed = ev.code; onClose?.(ev.code); });
    await new Promise<void>((resolve, reject) => {
      const cap = setTimeout(() => { reject(new Error('websocket open timed out')); }, o.timeoutMs);
      ws.addEventListener('open', () => { clearTimeout(cap); resolve(); });
      ws.addEventListener('error', () => { clearTimeout(cap); reject(new Error('websocket error before open')); });
    });
    let last = Number.NEGATIVE_INFINITY;
    const pace = async (): Promise<void> => {
      const wait = last + gapMs - now();
      if (wait > 0) await sleep(wait);
      last = now();
    };
    return {
      sendText: async (t) => { await pace(); ws.send(t); },
      sendBinary: async (b) => { await pace(); ws.send(b); },
      onText: (cb) => { onText = cb; for (const t of early.splice(0)) cb(t); },
      onClose: (cb) => { onClose = cb; if (closed !== undefined) cb(closed); },
      close: () => { ws.close(); },
    };
  };

  const adapter: ConformanceAdapter = {
    connect: async () => {
      try {
        const c = await open();
        stats.connected++;
        return c;
      } catch (e) {
        stats.connectFailures++;
        throw e;
      }
    },
  };
  return { adapter, hooks: { sleep, timeoutMs: o.timeoutMs, settleMs: o.settleMs }, stats };
}

export interface CliIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

const groupsOf = (): string[] => [...new Set(conformanceCases.map((c) => c.id.split('.')[0] as string))];

/** Parses argv and env, runs the suite, prints the result; returns the exit code (0 ok, 1 case failed, 2 bad config, 3 never connected). */
export async function runConformanceCli(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, io: CliIo, deps?: WsConformanceDeps): Promise<number> {
  const bad = (msg: string): number => { io.err(msg); return CONF.exit.badConfig; };
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        json: { type: 'boolean', default: false },
        'timeout-ms': { type: 'string', default: String(CONF.defaultTimeoutMs) },
        'settle-ms': { type: 'string', default: String(CONF.defaultSettleMs) },
        only: { type: 'string' },
        'strict-text': { type: 'boolean', default: false },
      },
    }));
  } catch (e) {
    return bad(`relay:conformance: ${e instanceof Error ? e.message : String(e)}`);
  }
  const baseUrl = env[CONF.urlEnv] ?? '';
  if (!/^https:\/\/[^/?#\s]+$/.test(baseUrl)) {
    return bad(`relay:conformance: set ${CONF.urlEnv} to the base URL, https, no path and no trailing slash (for example https://relay.example.invalid)`);
  }
  const timeoutMs = Number(values['timeout-ms']);
  const settleMs = Number(values['settle-ms']);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(settleMs) || settleMs < 0) return bad('relay:conformance: --timeout-ms must be a positive and --settle-ms a non-negative integer');
  const only = values.only?.split(',').map((s) => s.trim()).filter((s) => s !== '');
  if (only !== undefined && !conformanceCases.some((c) => only.some((p) => c.id.startsWith(p)))) return bad(`relay:conformance: --only matches no case; groups: ${groupsOf().join(', ')}`);

  const { adapter, hooks, stats } = createWsConformance({ baseUrl, timeoutMs, settleMs, strictText: values['strict-text'], ...(deps === undefined ? {} : { deps }) });
  const report: ConformanceReport = await runAll(adapter, hooks, only === undefined ? {} : { only });
  const delivery: Delivery = { text: stats.text, binary: stats.binary, notices: stats.notices };
  const connections = { ok: stats.connected, failed: stats.connectFailures };
  if (values.json) io.out(JSON.stringify({ report, delivery, connections }, null, 2));
  else {
    for (const r of report.results) io.out(`${r.status.toUpperCase().padEnd(4)} ${r.id}${r.message === undefined ? '' : `  ${r.message}`}`);
    io.out(`passed ${String(report.passed)}, failed ${String(report.failed)}, skipped ${String(report.skipped)}; delivery text ${String(delivery.text)}, binary ${String(delivery.binary)}, notices ${String(delivery.notices.length)}`);
  }
  if (connections.ok === 0 && connections.failed > 0) return CONF.exit.neverConnected;
  return report.ok ? CONF.exit.ok : CONF.exit.caseFailed;
}
