// pnpm online:live-match [--resume|--gone|--rematch|--disagree|--bad-version|--malformed] (see --help): two OnlineClients play queue -> match -> a few batches -> RESULT -> RESULT_ACK against a REAL relay.
// The address comes only from env TTE_RELAY_URL (https, no path); it is never printed. Traffic is light: one match, ~20 batches per side
// paced at BATCH_GAP_MS (an estimate chosen to stay well under the stage's 10 frames/s limit, not a measurement). Exit: 0 ok, 1 step failed, 2 bad config.
import { pathToFileURL } from 'node:url';
import { SIM_VERSION } from '../src/core/version';
import { Cmd, type Command } from '../src/core/sim/commands';
import { encodePacket } from '../src/core/net/packet';
import { decodeFrame } from '../src/core/relay/codec';
import { decodeText } from '../src/core/relay/text-codec';
import { parseOnlineUrl } from '../src/game/net/ws/config';
import { BATCH_GAP_MS, DRAIN_MAX_MS, INPUT_GAP_MS, STEP_TIMEOUT_MS } from './live-match-constants';
import { badVersion, HELP, runPaired, SCENARIOS, type Peer, type Rig, type Scenario } from './live-match-scenarios';
import { OnlineClient, type FetchLike, type OnlineEvent, type WsCtor } from '../src/game/net/ws/online-client';

export { BATCH_GAP_MS, DRAIN_MAX_MS, INPUT_GAP_MS, STEP_TIMEOUT_MS } from './live-match-constants';
const SCRIPT: Record<string, readonly Command[]> = {
  A: [Cmd.right, Cmd.right, Cmd.right | Cmd.up, Cmd.right | Cmd.primary, Cmd.primary, 0],
  B: [Cmd.left, Cmd.left, Cmd.secondary, Cmd.left | Cmd.primary, 0, Cmd.down],
};
export const BATCHES_PER_SIDE = Number(process.env['TTE_BATCHES'] ?? '20');
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const redact = (s: string): string => s.replace(/https?:\/\/\S+|wss?:\/\/\S+/g, '<url>');


// --trace (or TTE_TRACE=1): print every HTTP request/response and every WebSocket message in full. Only the host, the URL path of a
// wss address and credential values (session token, ticket) are masked, so the output is safe to paste; nothing else is hidden.
const secrets = new Set<string>();
let traceOn = false;
const mask = (s: string): string => {
  let r = s.replace(/(https?|wss?):\/\/[^/\s"?]+(\/[^\s"?]*)?/g, (_m, sch: string, path?: string) => `${sch}://<host>${path === undefined ? '' : sch.startsWith('ws') ? '/<stage>' : path}`);
  for (const t of secrets) r = r.split(t).join(`<token len=${String(t.length)}>`);
  return r;
};
const tr = (line: string): void => { if (traceOn) process.stdout.write(`${mask(line)}\n`); };
const hexOf = (_k: string, v: unknown): unknown => (v instanceof Uint8Array ? [...v].map((x) => x.toString(16).padStart(2, '0')).join(' ') : v);
const describeText = (t: string): string => {
  const bytes = decodeText(t);
  const d = bytes === undefined ? undefined : decodeFrame(bytes);
  return d?.ok === true ? JSON.stringify(d.frame, hexOf) : `(not a frame) ${t.slice(0, 120)}`;
};
const tracedFetch: FetchLike = async (url, init) => {
  const bearer = /^Bearer (.+)$/.exec(init.headers['Authorization'] ?? '')?.[1];
  if (bearer !== undefined) secrets.add(bearer);
  tr(`>>> HTTP ${init.method} ${url}`);
  for (const [k, v] of Object.entries(init.headers)) tr(`>>>   ${k}: ${v}`);
  tr(`>>>   body: ${init.body ?? '(none)'}`);
  const res = await fetch(url, init);
  const body = await res.clone().text();
  for (const k of ['session', 'ticket']) { const m = new RegExp(`"${k}"\\s*:\\s*"([^"]+)"`).exec(body); if (m?.[1] !== undefined) secrets.add(m[1]); }
  tr(`<<< HTTP ${String(res.status)}`);
  res.headers.forEach((v, k) => { tr(`<<<   ${k}: ${v}`); });
  tr(`<<<   body: ${body}`);
  return res;
};
/** Raw BATCH seq arrivals per socket (ws1 = A, ws2 = B), in arrival order, counted before the reorder buffer. */
const arrivals = new Map<string, number[]>();
const noteArrival = (id: string, t: string): void => {
  const bytes = decodeText(t);
  const d = bytes === undefined ? undefined : decodeFrame(bytes);
  if (d?.ok === true && d.frame.t === 'batch') arrivals.set(id, [...(arrivals.get(id) ?? []), d.frame.seq]);
};
/** One line per socket: raw arrivals, seqs missing below the highest seen, and arrivals that came after a higher seq. */
export function summariseArrivals(seqs: readonly number[]): string {
  const seen = new Set(seqs);
  const max = Math.max(0, ...seqs);
  const missing: number[] = [];
  for (let i = 1; i <= max; i++) if (!seen.has(i)) missing.push(i);
  let high = 0;
  let late = 0;
  for (const q of seqs) { if (q < high) late++; high = Math.max(high, q); }
  return `raw=${String(seqs.length)} max=${String(max)} missing=[${missing.join(',')}] late-after-higher=${String(late)}`;
}
class TracedWs extends WebSocket {
  constructor(url: string) {
    super(url);
    const id = `ws${String(++wsCount)}`;
    tr(`=== ${id} open ${url}`);
    this.addEventListener('open', () => { tr(`=== ${id} opened`); });
    this.addEventListener('close', (e) => { tr(`=== ${id} closed code=${String(e.code)}`); });
    this.addEventListener('message', (e) => {
      const d: unknown = e.data;
      if (typeof d === 'string') noteArrival(id, d);
      tr(typeof d === 'string' ? `<<< ${id} TEXT ${d}\n<<<     decoded: ${describeText(d)}` : `<<< ${id} BINARY ${String((d as ArrayBuffer).byteLength)} bytes`);
    });
  }
  override send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    tr(typeof data === 'string' ? `>>> ${this.url.length > 0 ? 'ws' : ''} TEXT ${data}\n>>>     decoded: ${describeText(data)}` : '>>> BINARY');
    super.send(data);
  }
}
let wsCount = 0;

interface Side extends Peer { readonly ws: WebSocket | undefined }

function side(name: string, httpUrl: string, simVersion = SIM_VERSION): Side {
  const me: { ws: WebSocket | undefined } = { ws: undefined };
  class Mine extends TracedWs { constructor(url: string) { super(url); me.ws = this; } }
  const c = new OnlineClient({
    config: { configured: true, httpUrl },
    fetch: tracedFetch,
    WebSocket: Mine as unknown as WsCtor,
    simVersion,
    now: () => performance.now(),
    after: (ms, fn) => { const t = setTimeout(fn, ms); return () => { clearTimeout(t); }; },
    random: () => Math.random(),
  });
  const events: OnlineEvent[] = [];
  c.onEvent = (e) => { events.push(e); };
  return { name, c, events, get ws() { return me.ws; } };
}

async function waitFor<T>(label: string, f: () => T | undefined): Promise<T> {
  const end = Date.now() + STEP_TIMEOUT_MS;
  for (;;) {
    const v = f();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error(`timeout: ${label}`);
    await sleep(50);
  }
}

export async function main(env: Readonly<Record<string, string | undefined>>, out: (l: string) => void): Promise<number> {
  const argv = process.argv.slice(2);
  const scripted = argv.includes('--inputs');
  const flags = argv.filter((x) => x.startsWith('--'));
  const scenarios = flags.filter((x) => (SCENARIOS as readonly string[]).includes(x.slice(2)));
  const known = new Set(['--inputs', '--trace', '--help', ...SCENARIOS.map((x) => `--${x}`)]);
  if (flags.includes('--help')) { out(HELP); return 0; }
  if (flags.some((x) => !known.has(x)) || scenarios.length > 1 || (scenarios.length === 1 && scripted)) { out(`bad flags (see --help): ${redact(flags.join(' '))}`); return 2; }
  const scenario = scenarios[0]?.slice(2) as Scenario | undefined;
  traceOn = process.argv.includes('--trace') || env['TTE_TRACE'] === '1';
  const cfg = parseOnlineUrl(env['TTE_RELAY_URL']);
  if (!cfg.configured) { out('TTE_RELAY_URL is not an https base URL'); return 2; }
  const a = side('A', cfg.httpUrl);
  const b = side('B', cfg.httpUrl);
  const t0 = performance.now();
  const step = (s: string): void => { out(`${String(Math.round(performance.now() - t0)).padStart(6)} ms  ${s}`); };
  const spawned: Side[] = [];
  const rig: Rig = {
    sleep, now: () => performance.now(), step,
    drop: (p) => { (p as Side).ws?.close(4000); },
    leave: (p) => { p.c.close(); },
    raw: (p, text) => { (p as Side).ws?.send(text); },
    spawn: (name, v) => { const s = side(name, cfg.httpUrl, v); spawned.push(s); return s; },
  };
  if (scenario === 'bad-version') {
    try { const ok = await badVersion(rig, SIM_VERSION); step(ok ? 'OK' : 'FAIL: bad-version'); return ok ? 0 : 1; } catch (e) { step(`FAIL: ${redact(e instanceof Error ? e.message : String(e))}`); return 1; } finally { for (const s of spawned) s.c.close(); }
  }
  try {
    for (const s of [a, b]) {
      const r = await s.c.connect();
      if (!r.ok) throw new Error(`${s.name} connect: ${r.failure.kind}`);
      step(`${s.name} connected`);
    }
    a.c.joinQueue(); await sleep(BATCH_GAP_MS); b.c.joinQueue();
    const match = (s: Side) => waitFor(`${s.name} match`, () => s.events.find((e) => e.t === 'match'));
    const [ma, mb] = await Promise.all([match(a), match(b)]);
    if (ma.t !== 'match' || mb.t !== 'match') throw new Error('unreachable');
    step(`matched id=${String(ma.matchId)} slots=${String(ma.slot)}/${String(mb.slot)} seed-equal=${String(ma.seed === mb.seed)}`);
    if (ma.matchId !== mb.matchId || ma.slot === mb.slot || ma.seed !== mb.seed) throw new Error('match descriptors disagree');
    if (scenario !== undefined) {
      const ok = await runPaired(scenario as Exclude<Scenario, 'bad-version'>, rig, a, b, ma);
      step(ok ? 'OK' : `FAIL: ${scenario}`);
      return ok ? 0 : 1;
    }
    const got = { A: 0, B: 0 };
    for (let i = 0; i < BATCHES_PER_SIDE; i++) {
      for (const s of [a, b]) {
        const cmds = scripted ? [(SCRIPT[s.name] ?? [0])[i % 6] ?? 0] : [];
        s.c.transport.send(encodePacket({ match: ma.matchId, flags: 0, ack: scripted ? i : 0, firstTick: i, inputs: cmds, hashes: [] }));
      }
      await sleep(scripted ? INPUT_GAP_MS : BATCH_GAP_MS);
      for (const s of [a, b]) { while (s.c.transport.receive() !== undefined) got[s.name as 'A' | 'B']++; }
    }
    const drainStart = Date.now();
    while ((got.A < BATCHES_PER_SIDE || got.B < BATCHES_PER_SIDE) && Date.now() - drainStart < DRAIN_MAX_MS) {
      await sleep(100);
      for (const s of [a, b]) { while (s.c.transport.receive() !== undefined) got[s.name as 'A' | 'B']++; }
    }
    if (Date.now() - drainStart > 0) step(`drained ${String(Date.now() - drainStart)} ms after the last send`);
    for (const [id, seqs] of [...arrivals].sort((x, y) => (x[0] < y[0] ? -1 : 1))) step(`raw BATCH arrivals ${id}: ${summariseArrivals(seqs)}`);
    for (const s of [a, b]) step(`${s.name} transport: staleMatch=${String(s.c.transport.staleMatch)} malformed=${String(s.c.transport.malformed)} lastError=${JSON.stringify(s.c.transport.lastError ?? null)}`);
    step(`batches received A=${String(got.A)} B=${String(got.B)} of ${String(BATCHES_PER_SIDE)} sent each way`);
    a.c.transport.sendResult(ma.matchId, 0, 0, 100, 0xabcd); await sleep(BATCH_GAP_MS);
    b.c.transport.sendResult(ma.matchId, 0, 0, 100, 0xabcd);
    const ack = (s: Side) => waitFor(`${s.name} result-ack`, () => s.events.find((e) => e.t === 'result-ack'));
    const [ra, rb] = await Promise.all([ack(a), ack(b)]);
    step(`result-ack A=${JSON.stringify(ra)} B=${JSON.stringify(rb)}`);
    const rtt = [a.c.rttMs(), b.c.rttMs()];
    step(`median rtt ms (measurement, live) A=${String(rtt[0])} B=${String(rtt[1])}`);
    // Lost = a frame never reached the socket. A frame that arrived but was dropped by the client's reorder buffer (it came after a higher seq) is
    // reported as "dropped as late" and is not a failure: the next BATCH repeats its inputs (docs/ONLINE-PROTOCOL.md sections 1 and 6).
    const raw = [...arrivals.values()].map((q) => new Set(q).size);
    const lost = raw.length < 2 || raw.some((n) => n < BATCHES_PER_SIDE);
    const late = got.A < BATCHES_PER_SIDE || got.B < BATCHES_PER_SIDE;
    if (!lost && late) step('dropped as late by the reorder buffer (arrived out of order); not lost on the wire');
    step(lost ? 'FAIL: batches lost on the wire' : 'OK');
    return lost ? 1 : 0;
  } catch (e) {
    step(`FAIL: ${redact(e instanceof Error ? e.message : String(e))}`);
    for (const s of [a, b]) step(`${s.name} events: ${s.events.map((e) => e.t).join(',')}`);
    return 1;
  } finally {
    a.c.close(); b.c.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.env, (l) => { process.stdout.write(`${l}\n`); });
}
