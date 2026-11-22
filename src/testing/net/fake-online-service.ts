import { FakeRelay } from './fake-relay';
import { parseOnlineUrl } from '../../game/net/ws/config';
import { OnlineClient, PROTOCOL_VERSION, type FetchLike, type OnlineDeps, type OnlineEvent, type WsLike } from '../../game/net/ws/online-client';
import { decodeText, encodeText } from '../../game/net/ws/text-codec';
import { encodeFrame } from '../../game/net/ws/wire';
import { encodePacket } from '../../core/net/packet';

/** In-memory online service (HTTP, tickets, WebSocket, queue, MATCH_START) for the client and quick-match tests; see docs/ONLINE-CLIENT.md. */

export const BASE = 'https://relay.example.invalid';
export const SESSION_ID = 77;
/** An empty `Packet` (12 bytes, no inputs or hashes). */
export const BATCH = new Uint8Array(12);


export const ascii = (t: string): number[] => Array.from({ length: t.length }, (_, i) => t.charCodeAt(i));
/** A constructor that hands back what `make` builds (a function constructor may return an object). */
export const ctor = (make: (url: string) => WsLike): OnlineDeps['WebSocket'] => function (url: string) { return make(url); } as unknown as OnlineDeps['WebSocket'];

type Listener = (ev: never) => void;

/** What FakeService needs of one connection's server side: TestWs here, a real socket in src/testing/net/ws-int. */
export interface ServedWs {
  readonly readyState: number;
  /** Sends one frame to the client. */
  serve(bytes: Uint8Array): void;
  /** Closes with `code`. */
  drop(code: number): void;
}

/** In-memory WebSocket whose "server" is the FakeService. */
export class TestWs implements WsLike, ServedWs {
  readyState = 0;
  readonly sent: Uint8Array[] = [];
  private readonly listeners = new Map<string, Listener[]>();
  constructor(readonly url: string, private readonly svc: FakeService) {
    svc.sockets.push(this);
    queueMicrotask(() => { svc.accept(this); });
  }
  send(data: string): void {
    if (this.readyState !== 1) throw new Error('closed');
    const b = decodeText(data);
    if (b === undefined) throw new Error('not base64 text');
    this.sent.push(b);
    this.svc.onFrame(this, b);
  }
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close(code = 1000): void { this.drop(code); }
  drop(code: number): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close', { code });
  }
  emit(type: string, ev: object = {}): void {
    for (const l of this.listeners.get(type) ?? []) (l as (e: object) => void)(ev);
  }
  serve(bytes: Uint8Array): void {
    this.emit('message', { data: encodeText(bytes) });
  }
}

export const welcome = (ver: number, resumed: number, caps = 0): Uint8Array => {
  const b = new Uint8Array(9);
  const d = new DataView(b.buffer);
  b[0] = 0x02; b[1] = ver; d.setUint32(2, SESSION_ID); b[6] = resumed; b[7] = caps; b[8] = 64;
  return b;
};
/** MATCH_START; `p` overrides what the service says about input delay, sim version and batch period (defaults: 2, 86, 1). */
export const matchStart = (slot: number, matchId = 1, p: { inputDelay?: number; simVersion?: number; batchEvery?: number } = {}): Uint8Array => {
  const b = new Uint8Array(11);
  const d = new DataView(b.buffer);
  b[0] = 0x30; b[1] = matchId; b[2] = slot; d.setUint32(3, 0xabcdef01); b[7] = p.inputDelay ?? 2; d.setUint16(8, p.simVersion ?? 86); b[10] = p.batchEvery ?? 1;
  return b;
};
export const resultAck = (matchId: number, status = 0): Uint8Array => Uint8Array.of(0x51, matchId, status);
export const peerStatus = (matchId: number, event: number): Uint8Array => Uint8Array.of(0x44, matchId, event, 0x27, 0x10);
/** A BATCH payload whose `Packet.match` byte is `match` and whose `firstTick` is `tick`. */
export const pkt = (match: number, tick = 0): Uint8Array => encodePacket({ match, flags: 0, ack: 0, firstTick: tick, inputs: [], hashes: [] });
export const errorFrame = (code: number, retryAfterSec = 0): Uint8Array => encodeFrame({ t: 'error', code, retryAfterSec, detail: 0 });

/** The backend: HTTP endpoints, tickets (single use, 60 s, handed out as `{ticket, url}`), HELLO/WELCOME, a queue and a pass-through to a FakeRelay for match frames. */
export class FakeService {
  readonly sockets: TestWs[] = [];
  readonly fetched: string[] = [];
  readonly hellos: { ver: number; resume: number }[] = [];
  readonly issued = new Map<string, number>();
  readonly used = new Set<string>();
  sessions = 0;
  /** The relay assigns matchIds counting up from 1 per pair. */
  matchNo = 0;
  httpStatus = 200;
  httpRetry = 0;
  refuseSockets = 0;
  /** false: every HELLO is a fresh session (a client that was only queued has nothing to resume). */
  resumeSessions = true;
  serverVer = PROTOCOL_VERSION;
  welcomeVer: number | undefined;
  /** WELCOME byte 7 (bit0 = chat). */
  caps = 0;
  /** What MATCH_START announces (tests change them to exercise the screen). */
  simVersion = 86;
  inputDelay = 2;
  batchEvery = 1;
  relay: FakeRelay | undefined;
  private readonly queue: ServedWs[] = [];
  private readonly slots = new Map<ServedWs, number>();

  constructor(private readonly clock: { ms: number }) {}

  readonly fetch: FetchLike = (url, init) => {
    this.fetched.push(url.replace(BASE, ''));
    if (this.httpStatus !== 200) return Promise.resolve(reply(this.httpStatus, { error: 'x', code: this.httpStatus === 503 ? 0x0b : 0x0c, retryAfterSec: this.httpRetry }));
    if (url === `${BASE}/session`) {
      this.sessions++;
      return Promise.resolve(reply(200, { session: `s${String(this.sessions)}`, expiresIn: 86400, echo: init.body }));
    }
    const t = `t${String(this.issued.size + 1)}`;
    this.issued.set(t, this.clock.ms);
    return Promise.resolve(reply(200, { ticket: t, url: `wss://relay.example.invalid/ws?ticket=${encodeURIComponent(t)}` }));
  };

  makeSocket = (url: string): WsLike => new TestWs(url, this);

  /** Ticket check of a socket open: true (and the ticket is used up) when `url` carries a live, unused ticket and no refusal is pending. */
  admit(url: string): boolean {
    const t = decodeURIComponent(url.split('ticket=')[1] ?? '');
    const born = this.issued.get(t);
    if (this.refuseSockets > 0 || born === undefined || this.used.has(t) || this.clock.ms - born > 60_000) {
      if (this.refuseSockets > 0) this.refuseSockets--;
      return false;
    }
    this.used.add(t);
    return true;
  }

  accept(ws: TestWs): void {
    if (!this.admit(ws.url)) {
      ws.emit('error');
      ws.drop(1006);
      return;
    }
    ws.readyState = 1;
    ws.emit('open');
  }

  onFrame(ws: ServedWs, b: Uint8Array): void {
    switch (b[0]) {
      case 0x01: {
        const d = new DataView(b.buffer);
        const hello = { ver: b[1] ?? 0, resume: d.getUint32(4) };
        this.hellos.push(hello);
        if (hello.ver !== this.serverVer) {
          ws.serve(errorFrame(0x0003));
          ws.drop(4003);
          return;
        }
        const resumed = this.resumeSessions && hello.resume === SESSION_ID;
        ws.serve(welcome(this.welcomeVer ?? this.serverVer, resumed ? 1 : 0, this.caps));
        if (resumed) ws.serve(matchStart(this.slots.get(ws) ?? 0, this.matchNo, this));
        break;
      }
      case 0x10:
        ws.serve(Uint8Array.of(0x12, 0, 3));
        for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i]?.readyState !== 1) this.queue.splice(i, 1);
        this.queue.push(ws);
        if (this.queue.length === 2) {
          const [p, q] = this.queue.splice(0, 2) as [ServedWs, ServedWs];
          this.startMatch(p, q);
        }
        break;
      case 0x20:
        ws.serve(Uint8Array.of(0x21, ...ascii('AB23CD'), 2, 88));
        break;
      case 0x22:
        ws.serve(errorFrame(0x0006));
        break;
      default:
        this.pass(ws, b);
    }
  }

  /** A new match for the pair (queue match or rematch): next matchId, slots 0 and 1. */
  startMatch(p: ServedWs, q: ServedWs): void {
    this.matchNo++;
    this.slots.set(p, 0);
    this.slots.set(q, 1);
    p.serve(matchStart(0, this.matchNo, this));
    q.serve(matchStart(1, this.matchNo, this));
  }

  /** Match frames go through the FakeRelay: first socket is side a, second side b. */
  private pass(ws: ServedWs, b: Uint8Array): void {
    const r = this.relay;
    if (!r) return;
    const side = [r.a, r.b][this.sockets.filter((s) => s.readyState === 1 && this.slots.has(s)).indexOf(ws as TestWs)];
    side?.send(encodeText(b));
  }

  wire(a: TestWs, b: TestWs): void {
    const r = this.relay;
    if (!r) return;
    const both = (f: (ev: { data: unknown }) => void): ((ev: { data: unknown }) => void) & (() => void) => f as never;
    r.a.addEventListener('message', both((ev) => { a.emit('message', ev); }));
    r.b.addEventListener('message', both((ev) => { b.emit('message', ev); }));
  }
}

export function reply(status: number, body: unknown): Awaited<ReturnType<FetchLike>> {
  return { status, headers: { get: (n) => (n === 'Retry-After' ? null : null) }, json: () => Promise.resolve(body) };
}

export class Harness {
  readonly clock = { ms: 0 };
  readonly svc = new FakeService(this.clock);
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 0;

  deps(configured = true, extra: Partial<OnlineDeps> = {}): OnlineDeps {
    const svc = this.svc;
    return {
      config: parseOnlineUrl(configured ? BASE : undefined),
      fetch: svc.fetch,
      WebSocket: ctor((url) => svc.makeSocket(url)),
      simVersion: svc.simVersion,
      now: () => this.clock.ms,
      after: (ms, fn) => this.after(ms, fn),
      random: () => 0,
      ...extra,
    };
  }

  /** One-shot timer on the same virtual clock as `deps().after`; returns its canceller. */
  after(ms: number, fn: () => void): () => void {
    const id = this.nextId++;
    this.timers.push({ at: this.clock.ms + ms, fn, id });
    return () => { this.timers = this.timers.filter((t) => t.id !== id); };
  }

  client(): { c: OnlineClient; events: OnlineEvent[] } {
    const c = new OnlineClient(this.deps());
    const events: OnlineEvent[] = [];
    c.onEvent = (e) => { events.push(e); };
    return { c, events };
  }

  async flush(): Promise<void> {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  }

  async step(ms: number): Promise<void> {
    const end = this.clock.ms + ms;
    for (;;) {
      await this.flush();
      const due = this.timers.filter((t) => t.at <= end).sort((x, y) => x.at - y.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.clock.ms = Math.max(this.clock.ms, due.at);
      due.fn();
    }
    this.clock.ms = end;
    await this.flush();
  }
}
