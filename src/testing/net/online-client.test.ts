import { describe, expect, it } from 'vitest';
import { FakeRelay } from './fake-relay';
import { onlineConfig, parseOnlineUrl } from '../../game/net/ws/config';
import {
  DEFAULT_RESTING_SEC,
  friendlyMessage,
  OnlineClient,
  PROTOCOL_VERSION,
  type FetchLike,
  type OnlineDeps,
  type OnlineEvent,
  type WsLike,
} from '../../game/net/ws/online-client';
import { decodeFrame, encodeFrame } from '../../game/net/ws/wire';

const BASE = 'https://relay.example.invalid';
const SESSION_ID = 77;
/** An empty `Packet` (12 bytes, no inputs or hashes). */
const BATCH = new Uint8Array(12);

const ascii = (t: string): number[] => Array.from({ length: t.length }, (_, i) => t.charCodeAt(i));
/** A constructor that hands back what `make` builds (a function constructor may return an object). */
const ctor = (make: (url: string) => WsLike): OnlineDeps['WebSocket'] => function (url: string) { return make(url); } as unknown as OnlineDeps['WebSocket'];

type Listener = (ev: never) => void;

/** In-memory WebSocket whose "server" is the FakeService. */
class TestWs implements WsLike {
  binaryType = 'blob';
  readyState = 0;
  readonly sent: Uint8Array[] = [];
  private readonly listeners = new Map<string, Listener[]>();
  constructor(readonly url: string, private readonly svc: FakeService) {
    svc.sockets.push(this);
    queueMicrotask(() => { svc.accept(this); });
  }
  send(data: ArrayBufferView): void {
    if (this.readyState !== 1) throw new Error('closed');
    const b = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
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
    this.emit('message', { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  }
}

const welcome = (ver: number, resumed: number): Uint8Array => {
  const b = new Uint8Array(9);
  const d = new DataView(b.buffer);
  b[0] = 0x02; b[1] = ver; d.setUint32(2, SESSION_ID); b[6] = resumed; d.setUint16(7, 64);
  return b;
};
const matchStart = (slot: number): Uint8Array => {
  const b = new Uint8Array(11);
  const d = new DataView(b.buffer);
  b[0] = 0x30; b[1] = 3; b[2] = slot; d.setUint32(3, 0xabcdef01); b[7] = 2; d.setUint16(8, 86); b[10] = 1;
  return b;
};
const errorFrame = (code: number, retryAfterSec = 0): Uint8Array => encodeFrame({ t: 'error', code, retryAfterSec, detail: 0 });

/** The backend: HTTP endpoints, tickets (single use, 60 s), HELLO/WELCOME, a queue and a pass-through to a FakeRelay for match frames. */
class FakeService {
  readonly sockets: TestWs[] = [];
  readonly fetched: string[] = [];
  readonly hellos: { ver: number; resume: number }[] = [];
  readonly issued = new Map<string, number>();
  readonly used = new Set<string>();
  sessions = 0;
  httpStatus = 200;
  httpRetry = 0;
  refuseSockets = 0;
  serverVer = PROTOCOL_VERSION;
  welcomeVer: number | undefined;
  relay: FakeRelay | undefined;
  private readonly queue: TestWs[] = [];
  private readonly slots = new Map<TestWs, number>();

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
    return Promise.resolve(reply(200, { ticket: t, expiresIn: 60 }));
  };

  makeSocket = (url: string): WsLike => new TestWs(url, this);

  accept(ws: TestWs): void {
    const t = decodeURIComponent(ws.url.split('ticket=')[1] ?? '');
    const born = this.issued.get(t);
    if (this.refuseSockets > 0 || born === undefined || this.used.has(t) || this.clock.ms - born > 60_000) {
      if (this.refuseSockets > 0) this.refuseSockets--;
      ws.emit('error');
      ws.drop(1006);
      return;
    }
    this.used.add(t);
    ws.readyState = 1;
    ws.emit('open');
  }

  onFrame(ws: TestWs, b: Uint8Array): void {
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
        const resumed = hello.resume === SESSION_ID;
        ws.serve(welcome(this.welcomeVer ?? this.serverVer, resumed ? 1 : 0));
        if (resumed) ws.serve(matchStart(this.slots.get(ws) ?? 0));
        break;
      }
      case 0x10:
        ws.serve(Uint8Array.of(0x12, 0, 3));
        this.queue.push(ws);
        if (this.queue.length === 2) this.queue.splice(0, 2).forEach((q, i) => { this.slots.set(q, i); q.serve(matchStart(i)); });
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

  /** Match frames go through the FakeRelay: first socket is side a, second side b. */
  private pass(ws: TestWs, b: Uint8Array): void {
    const r = this.relay;
    if (!r) return;
    const side = [r.a, r.b][this.sockets.filter((s) => s.readyState === 1 && this.slots.has(s)).indexOf(ws)];
    side?.send(b);
  }

  wire(a: TestWs, b: TestWs): void {
    const r = this.relay;
    if (!r) return;
    const both = (f: (ev: { data: unknown }) => void): ((ev: { data: unknown }) => void) & (() => void) => f as never;
    r.a.addEventListener('message', both((ev) => { a.emit('message', ev); }));
    r.b.addEventListener('message', both((ev) => { b.emit('message', ev); }));
  }
}

function reply(status: number, body: unknown): Awaited<ReturnType<FetchLike>> {
  return { status, headers: { get: (n) => (n === 'Retry-After' ? null : null) }, json: () => Promise.resolve(body) };
}

class Harness {
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
      simVersion: 86,
      now: () => this.clock.ms,
      after: (ms, fn) => {
        const id = this.nextId++;
        this.timers.push({ at: this.clock.ms + ms, fn, id });
        return () => { this.timers = this.timers.filter((t) => t.id !== id); };
      },
      random: () => 0,
      ...extra,
    };
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

describe('config', () => {
  it('derives wss from https and rejects the rest', () => {
    expect(parseOnlineUrl(BASE)).toEqual({ configured: true, httpUrl: BASE, wsUrl: 'wss://relay.example.invalid' });
    expect(parseOnlineUrl(`${BASE}/`)).toMatchObject({ configured: true, httpUrl: BASE });
    for (const bad of [undefined, '', 'http://relay.example.invalid', 'relay.example.invalid', `${BASE}/x/y`, 5]) expect(parseOnlineUrl(bad).configured).toBe(false);
    expect(onlineConfig(undefined).configured).toBe(false);
  });
});

describe('OnlineClient', () => {
  it('happy path: session, ticket, socket, queue, match, frames through the relay, ping', async () => {
    const h = new Harness();
    h.svc.relay = new FakeRelay(h.clock, 1);
    const a = h.client();
    const b = h.client();
    const ra = a.c.connect();
    await h.flush();
    const rb = b.c.connect();
    await h.flush();
    const [okA, okB] = [await ra, await rb];
    expect(okA.ok && okB.ok).toBe(true);
    expect(h.svc.fetched).toEqual(['/session', '/ticket', '/session', '/ticket']);
    expect(new Set(h.svc.sockets.map((s) => s.url)).size).toBe(2);
    expect(h.svc.sockets[0]?.url).toBe('wss://relay.example.invalid?ticket=t1');
    expect(h.svc.hellos).toEqual([{ ver: PROTOCOL_VERSION, resume: 0 }, { ver: PROTOCOL_VERSION, resume: 0 }]);
    h.svc.wire(h.svc.sockets[0] as TestWs, h.svc.sockets[1] as TestWs);

    expect(a.c.joinQueue() && b.c.joinQueue()).toBe(true);
    await h.flush();
    expect(a.events[0]).toEqual({ t: 'queue', waitingSec: 3 });
    const ma = a.events.find((e) => e.t === 'match');
    const mb = b.events.find((e) => e.t === 'match');
    expect(ma).toMatchObject({ slot: 0, seed: 0xabcdef01, inputDelay: 2, batchEvery: 1, resumed: false });
    expect(mb).toMatchObject({ slot: 1, seed: 0xabcdef01 });

    const ta = okA.ok ? okA.value : undefined;
    const tb = okB.ok ? okB.value : undefined;
    ta?.send(BATCH);
    h.svc.relay.advance();
    expect(tb?.receive()).toEqual(BATCH);
    await h.step(2000);
    h.svc.relay.advance();
    expect(ta?.rtts.length).toBe(1); // The FakeRelay answers the PING at once (0 ms on the virtual clock).
    expect(a.c.quality()).toBe('good');
    a.c.close();
    expect(a.events.at(-1)).toEqual({ t: 'closed', failure: undefined });
    expect(ta?.closed).toBe(true);
  });

  it('pings every 2 s and a PONG feeds the link grade', async () => {
    const h = new Harness();
    const { c } = h.client();
    const r = await Promise.all([c.connect(), h.flush()]);
    expect(r[0].ok).toBe(true);
    const ws = h.svc.sockets[0] as TestWs;
    await h.step(2000);
    const ping = ws.sent.map((m) => decodeFrame(m)).find((f) => f?.t === 'ping');
    expect(ping).toBeDefined();
    h.clock.ms += 30;
    ws.serve(encodeFrame({ t: 'pong', nonce: ping?.t === 'ping' ? ping.nonce : -1 }));
    expect(c.rttMs()).toBe(30);
    expect(c.quality()).toBe('good');
    await h.step(2000);
    expect(ws.sent.filter((m) => m[0] === 0x60).length).toBe(2);
  });

  it('rooms: create gives a code, a bad code is refused locally, a server error leaves the link up', async () => {
    const h = new Harness();
    const { c, events } = h.client();
    await Promise.all([c.connect(), h.flush()]);
    expect(c.createRoom()).toBe(true);
    expect(c.joinRoom('ab1')).toBe(false);
    expect(c.joinRoom(' ab 23 cd ')).toBe(true);
    await h.flush();
    expect(events[0]).toEqual({ t: 'room-created', code: 'AB23CD', ttlSec: 600 });
    const e = events[1];
    expect(e).toMatchObject({ t: 'error', failure: { kind: 'server', code: 6 } });
    expect(e?.t === 'error' ? friendlyMessage(e.failure) : '').toContain('room code');
    expect((h.svc.sockets[0] as TestWs).sent.at(-1)?.slice(1)).toEqual(Uint8Array.from(ascii('AB23CD')));
  });

  it('a refused ticket is retried once with a fresh ticket, never reused', async () => {
    const h = new Harness();
    h.svc.refuseSockets = 1;
    const { c } = h.client();
    const [r] = await Promise.all([c.connect(), h.flush()]);
    expect(r.ok).toBe(true);
    expect(h.svc.fetched).toEqual(['/session', '/ticket', '/ticket']);
    expect(h.svc.sockets.map((s) => s.url.split('=')[1])).toEqual(['t1', 't2']);
  });

  it('two refused tickets fail with a typed result', async () => {
    const h = new Harness();
    h.svc.refuseSockets = 2;
    const { c } = h.client();
    const [r] = await Promise.all([c.connect(), h.flush()]);
    expect(r).toEqual({ ok: false, failure: { kind: 'network' } });
    expect(h.svc.sockets.length).toBe(2);
  });

  it('an expired ticket (older than 60 s) is refused by the service', async () => {
    const h = new Harness();
    const deps = h.deps(true, { WebSocket: ctor((url) => { h.clock.ms += 61_000; return h.svc.makeSocket(url); }) });
    const c = new OnlineClient(deps);
    const [r] = await Promise.all([c.connect(), h.flush()]);
    expect(r.ok).toBe(false);
  });

  it('reconnects with backoff, a new ticket each time, the old session id, and the seq continues', async () => {
    const h = new Harness();
    const { c, events } = h.client();
    const [r] = await Promise.all([c.connect(), h.flush()]);
    const t = r.ok ? r.value : undefined;
    c.joinQueue();
    c.createRoom();
    (h.svc.sockets[0] as TestWs).serve(matchStart(1));
    t?.send(BATCH);
    t?.send(BATCH);
    h.svc.refuseSockets = 4;
    const start = h.clock.ms;
    (h.svc.sockets[0] as TestWs).drop(1006);
    expect(t?.closed).toBe(false);
    await h.step(0);
    expect(events.filter((e) => e.t === 'reconnecting').length).toBe(1);
    await h.step(1000);
    expect(events.filter((e) => e.t === 'reconnecting').length).toBe(2);
    await h.step(2000);
    expect(events.filter((e) => e.t === 'reconnecting').length).toBe(3);
    expect(events.at(-2)).toMatchObject({ t: 'match', resumed: true });
    expect(events.at(-1)).toEqual({ t: 'reconnected', resumed: true });
    expect(h.clock.ms - start).toBe(3000);
    expect(h.svc.hellos.at(-1)).toEqual({ ver: PROTOCOL_VERSION, resume: SESSION_ID });
    expect(h.svc.fetched.filter((p) => p === '/ticket').length).toBe(6);
    t?.send(BATCH);
    const batches = h.svc.sockets.flatMap((s) => s.sent).filter((m) => m[0] === 0x40).map((m) => new DataView(m.buffer).getUint32(1));
    expect(batches).toEqual([0, 1, 2]);
  });

  it('gives up after the grace and tells the transport', async () => {
    const h = new Harness();
    const { c, events } = h.client();
    const [r] = await Promise.all([c.connect(), h.flush()]);
    (h.svc.sockets[0] as TestWs).serve(matchStart(0));
    h.svc.refuseSockets = 99;
    (h.svc.sockets[0] as TestWs).drop(1006);
    await h.step(30_000);
    expect(events.at(-1)).toEqual({ t: 'closed', failure: { kind: 'network' } });
    expect(r.ok && r.value.closed).toBe(true);
  });

  it('kill switch over HTTP: resting, and no request before the wait is over', async () => {
    const h = new Harness();
    h.svc.httpStatus = 503;
    h.svc.httpRetry = 120;
    const { c } = h.client();
    expect(await c.connect()).toEqual({ ok: false, failure: { kind: 'resting', retryAfterSec: 120 } });
    h.svc.httpStatus = 200;
    await h.step(60_000);
    const again = await c.connect();
    expect(again).toMatchObject({ ok: false, failure: { kind: 'resting', retryAfterSec: 60 } });
    expect(h.svc.fetched).toEqual(['/session']);
    expect(h.svc.sockets.length).toBe(0);
  });

  it('resting with no time means one hour, in words', () => {
    expect(friendlyMessage({ kind: 'resting', retryAfterSec: 0 })).toContain('1 h');
    expect(DEFAULT_RESTING_SEC).toBe(3600);
    expect(friendlyMessage({ kind: 'resting', retryAfterSec: 300 })).toContain('5 min');
  });

  it('kill switch in a frame: event, then close 4011 ends without reconnect', async () => {
    const h = new Harness();
    const { c, events } = h.client();
    const [r] = await Promise.all([c.connect(), h.flush()]);
    const ws = h.svc.sockets[0] as TestWs;
    ws.serve(errorFrame(0x000b, 0));
    expect(events.at(-1)).toEqual({ t: 'resting', failure: { kind: 'resting', retryAfterSec: 0 } });
    expect(r.ok && r.value.lastError?.code).toBe(0x000b);
    ws.drop(4011);
    await h.step(30_000);
    expect(events.at(-1)).toEqual({ t: 'closed', failure: { kind: 'resting', retryAfterSec: 0 } });
    expect(h.svc.fetched).toEqual(['/session', '/ticket']);
    expect((await c.connect()).ok).toBe(false);
  });

  it('version mismatch: update needed, no retry', async () => {
    const h = new Harness();
    h.svc.serverVer = 2;
    const { c } = h.client();
    const [r] = await Promise.all([c.connect(), h.flush()]);
    expect(r).toEqual({ ok: false, failure: { kind: 'update-needed' } });
    expect(h.svc.sockets.length).toBe(1);
    expect(friendlyMessage({ kind: 'update-needed' })).toMatch(/reload/i);
  });

  it('a WELCOME with another version is also update needed', async () => {
    const h = new Harness();
    h.svc.welcomeVer = 9;
    const { c } = h.client();
    const [r] = await Promise.all([c.connect(), h.flush()]);
    expect(r).toEqual({ ok: false, failure: { kind: 'update-needed' } });
  });

  it('not configured: clean result, no network, no Steam url', async () => {
    const h = new Harness();
    const c = new OnlineClient(h.deps(false));
    expect(await c.connect()).toEqual({ ok: false, failure: { kind: 'not-configured' } });
    expect(c.steamStartUrl()).toBeUndefined();
    expect((await c.signInWithSteam('x')).ok).toBe(false);
    expect(h.svc.fetched).toEqual([]);
    expect(c.joinQueue()).toBe(false);
  });

  it('malformed server frames are ignored and counted by the transport', async () => {
    const h = new Harness();
    const { c, events } = h.client();
    const [r] = await Promise.all([c.connect(), h.flush()]);
    const ws = h.svc.sockets[0] as TestWs;
    ws.serve(Uint8Array.of(0x30, 1, 2)); // MATCH_START too short
    ws.serve(Uint8Array.of(0x21, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0, 5)); // room code with 0
    ws.serve(Uint8Array.of(0x23, 7));
    ws.serve(Uint8Array.of(0xee));
    ws.serve(new Uint8Array(0));
    ws.emit('message', { data: 'text' });
    ws.emit('message', { data: undefined });
    expect(events).toEqual([]);
    expect(r.ok && r.value.malformed).toBe(7);
    expect(ws.readyState).toBe(1);
  });

  it('network errors never throw', async () => {
    const h = new Harness();
    const reject: FetchLike = () => Promise.reject(new Error('offline'));
    expect(await new OnlineClient(h.deps(true, { fetch: reject })).connect()).toEqual({ ok: false, failure: { kind: 'network' } });
    const badJson: FetchLike = () => Promise.resolve({ status: 200, headers: { get: () => null }, json: () => Promise.reject(new Error('not json')) });
    expect(await new OnlineClient(h.deps(true, { fetch: badJson })).connect()).toEqual({ ok: false, failure: { kind: 'bad-response' } });
    const wrong: FetchLike = () => Promise.resolve(reply(200, { session: 5 }));
    expect(await new OnlineClient(h.deps(true, { fetch: wrong })).connect()).toEqual({ ok: false, failure: { kind: 'bad-response' } });
    const server: FetchLike = () => Promise.resolve(reply(500, { error: 'internal', code: 12, retryAfterSec: 3 }));
    expect(await new OnlineClient(h.deps(true, { fetch: server })).connect()).toEqual({ ok: false, failure: { kind: 'server', code: 12, retryAfterSec: 3, status: 500 } });
    const noWs = h.deps(true, { WebSocket: ctor(() => { throw new Error('blocked'); }) });
    expect(await new OnlineClient(noWs).connect()).toEqual({ ok: false, failure: { kind: 'network' } });
    expect(friendlyMessage({ kind: 'network' })).not.toContain('relay.example');
  });

  it('a silent server times out', async () => {
    const h = new Harness();
    const mute = h.deps(true, { WebSocket: ctor((url) => { const w = new TestWs(url, h.svc); w.send = () => undefined; return w; }) });
    const p = new OnlineClient(mute).connect();
    await h.step(11_000);
    await h.step(11_000);
    expect(await p).toEqual({ ok: false, failure: { kind: 'network' } });
  });

  it('Steam: start url and a one-time code exchange', async () => {
    const h = new Harness();
    const c = new OnlineClient(h.deps());
    expect(c.steamStartUrl()).toBe(`${BASE}/auth/openid/start`);
    expect(await c.signInWithSteam('one-time')).toEqual({ ok: true, value: true });
    const bodies: string[] = [];
    const spy: FetchLike = (u, i) => { bodies.push(i.body ?? ''); return h.svc.fetch(u, i); };
    const c2 = new OnlineClient(h.deps(true, { fetch: spy }));
    await c2.signInWithSteam('one-time');
    expect(bodies).toEqual(['{"kind":"steam","code":"one-time"}']);
    const p = c.connect();
    await h.flush();
    expect(await p).toMatchObject({ ok: true });
    expect(h.svc.fetched).toEqual(['/session', '/session', '/ticket']);
  });
});
