import { describe, expect, it } from 'vitest';
import { FakeRelay } from './fake-relay';
import { onlineConfig, parseOnlineUrl } from '../../game/net/ws/config';
import { DEFAULT_RESTING_SEC, friendlyMessage, OnlineClient, PROTOCOL_VERSION, type FetchLike } from '../../game/net/ws/online-client';
import { WebSocketTransport } from '../../game/net/ws/transport';
import { decodeFrame, encodeFrame } from '../../game/net/ws/wire';
import { ascii, BASE, BATCH, ctor, errorFrame, Harness, matchStart, peerStatus, pkt, reply, resultAck, SESSION_ID, TestWs } from './fake-online-service';


describe('config', () => {
  it('keeps only the https base (the wss address comes from /ticket) and rejects the rest', () => {
    expect(parseOnlineUrl(BASE)).toEqual({ configured: true, httpUrl: BASE });
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
    expect(h.svc.sockets[0]?.url).toBe('wss://relay.example.invalid/ws?ticket=t1');
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
    ta?.send(pkt(1));
    h.svc.relay.advance();
    expect(tb?.receive()).toEqual(pkt(1));
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

  it('opens the url of the /ticket response unchanged, no ?ticket= appended', async () => {
    const h = new Harness();
    const { c } = h.client();
    await Promise.all([c.connect(), h.flush()]);
    expect(h.svc.sockets[0]?.url).toBe('wss://relay.example.invalid/ws?ticket=t1');
    expect(h.svc.sockets[0]?.url.split('ticket=').length).toBe(2);
  });

  it('a ticket response whose url is missing or not wss:// is a server fault, and no socket opens', async () => {
    for (const url of [undefined, '', 'ws://relay.example.invalid/ws?ticket=t1', 'https://relay.example.invalid/ws', 5]) {
      const h = new Harness();
      const deps = h.deps(true, { fetch: (u) => Promise.resolve(reply(200, u.endsWith('/session') ? { session: 's', expiresIn: 60 } : { ticket: 't1', url })) });
      const r = await new OnlineClient(deps).connect();
      expect(r, String(url)).toEqual({ ok: false, failure: { kind: 'bad-response' } });
      expect(h.svc.sockets.length).toBe(0);
    }
  });

  it('any failure before WELCOME gets one fresh ticket, even an ERROR frame (ticket-invalid is never sent by v3)', async () => {
    const h = new Harness();
    const first = h.svc.onFrame.bind(h.svc);
    let n = 0;
    h.svc.onFrame = (ws, b) => {
      if (b[0] === 0x01 && n++ === 0) { ws.serve(errorFrame(0x000c)); ws.drop(4012); return; }
      first(ws, b);
    };
    const { c } = h.client();
    const [r] = await Promise.all([c.connect(), h.flush()]);
    expect(r.ok).toBe(true);
    expect(h.svc.fetched).toEqual(['/session', '/ticket', '/ticket']);
  });

  it('a second pre-WELCOME failure is a failed attempt, not a third try', async () => {
    const h = new Harness();
    h.svc.onFrame = (ws) => { ws.serve(errorFrame(0x000c)); ws.drop(4012); };
    const { c } = h.client();
    const [r] = await Promise.all([c.connect(), h.flush()]);
    expect(r).toEqual({ ok: false, failure: { kind: 'server', code: 0x000c, retryAfterSec: 0, status: 0 } });
    expect(h.svc.sockets.length).toBe(2);
  });

  it('with no ERROR frame the close code is only a hint: 4011 means resting, an unknown code is a network drop', async () => {
    const a = new Harness();
    a.svc.onFrame = (ws) => { ws.drop(4011); };
    const ra = await Promise.all([a.client().c.connect(), a.flush()]);
    expect(ra[0]).toEqual({ ok: false, failure: { kind: 'resting', retryAfterSec: 0 } });
    expect(a.svc.sockets.length).toBe(1);
    const b = new Harness();
    b.svc.onFrame = (ws) => { ws.drop(4004); };
    const rb = await Promise.all([b.client().c.connect(), b.flush()]);
    expect(rb[0]).toEqual({ ok: false, failure: { kind: 'network' } });
    expect(b.svc.sockets.length).toBe(2);
  });

  it('the ERROR frame wins over a different close code: frame 0x000b then close 1006 still ends as resting', async () => {
    const h = new Harness();
    const { c, events } = h.client();
    await Promise.all([c.connect(), h.flush()]);
    const ws = h.svc.sockets[0] as TestWs;
    ws.serve(errorFrame(0x000b, 90));
    ws.drop(1006);
    await h.step(30_000);
    expect(events.at(-1)).toEqual({ t: 'closed', failure: { kind: 'resting', retryAfterSec: 90 } });
    expect(h.svc.fetched).toEqual(['/session', '/ticket']);
  });

  it('a binary message (or non-base64 text) from the server is counted as malformed and ignored', async () => {
    const h = new Harness();
    const { c } = h.client();
    const [r] = await Promise.all([c.connect(), h.flush()]);
    const ws = h.svc.sockets[0] as TestWs;
    ws.emit('message', { data: new Uint8Array([0x30, 1, 0]).buffer });
    ws.emit('message', { data: '!!!!' });
    expect(r.ok && r.value.malformed).toBe(2);
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
    h.svc.matchNo = 1;
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
    (h.svc.sockets.at(-1) as TestWs).serve(matchStart(1)); // A duplicate MATCH_START after a resume resets nothing.
    t?.send(BATCH);
    const batches = h.svc.sockets.flatMap((s) => s.sent).filter((m) => m[0] === 0x40).map((m) => new DataView(m.buffer).getUint32(1));
    expect(batches).toEqual([0, 1, 2]);
    expect(events.filter((e) => e.t === 'match').map((e) => (e as { resumed: boolean }).resumed)).toEqual([false, true, true]);
  });

  /** Two clients connected, wired through the FakeRelay and matched through the queue (match 1). */
  async function pair(): Promise<{ h: Harness; a: ReturnType<Harness['client']>; b: ReturnType<Harness['client']>; ta: WebSocketTransport; tb: WebSocketTransport; wa: TestWs; wb: TestWs }> {
    const h = new Harness();
    h.svc.relay = new FakeRelay(h.clock, 1);
    const a = h.client();
    const b = h.client();
    const ra = a.c.connect();
    await h.flush();
    const rb = b.c.connect();
    await h.flush();
    const [okA, okB] = [await ra, await rb];
    if (!okA.ok || !okB.ok) throw new Error('connect failed');
    const [wa, wb] = [h.svc.sockets[0] as TestWs, h.svc.sockets[1] as TestWs];
    h.svc.wire(wa, wb);
    a.c.joinQueue();
    b.c.joinQueue();
    await h.flush();
    return { h, a, b, ta: okA.value, tb: okB.value, wa, wb };
  }
  const drain = (t: WebSocketTransport): Uint8Array[] => {
    const out: Uint8Array[] = [];
    for (let p = t.receive(); p; p = t.receive()) out.push(p);
    return out;
  };
  const batchSeqs = (w: TestWs): number[] => w.sent.filter((m) => m[0] === 0x40).map((m) => new DataView(m.buffer).getUint32(1));

  it.each([['a rematch (new MATCH_START from the relay)', false], ['a new queue match on the same connections', true]])('plays a second match on the same clients: %s', async (_name, requeue) => {
    const { h, a, b, ta, tb, wa, wb } = await pair();
    const relay = h.svc.relay as FakeRelay;
    // Match 1: BATCH, PAUSE, HASH and RESULT frames use seq numbers on the wire (HASH/RESULT as 0), and a setup message goes through.
    ta.send(pkt(1, 0));
    ta.sendHash(1, 50, 7);
    ta.sendPause(1, 1);
    ta.send(pkt(1, 1));
    tb.send(pkt(1, 0));
    ta.control.send(Uint8Array.of(9, 9));
    relay.advance();
    tb.tick();
    expect(drain(tb)).toEqual([pkt(1, 0), pkt(1, 1)]);
    expect(tb.control.receive()).toEqual(Uint8Array.of(9, 9));
    expect(drain(ta)).toEqual([pkt(1, 0)]);
    expect(batchSeqs(wa)).toEqual([0, 2]); // PAUSE took seq 1, the HASH none.
    ta.sendResult(1, 0, 0, 100, 5);
    wa.serve(resultAck(1));
    wb.serve(resultAck(1));
    expect(a.events.filter((e) => e.t === 'result-ack')).toHaveLength(1);

    // Match 2.
    if (requeue) {
      a.c.joinQueue();
      b.c.joinQueue();
      await h.flush();
    } else h.svc.startMatch(wa, wb);
    const starts = a.events.filter((e) => e.t === 'match');
    expect(starts.map((e) => (e as { matchId: number }).matchId)).toEqual([1, 2]);
    expect(starts.map((e) => (e as { resumed: boolean }).resumed)).toEqual([false, false]);
    ta.send(pkt(2, 0));
    tb.send(pkt(2, 0));
    ta.send(pkt(2, 1));
    ta.control.send(Uint8Array.of(7));
    tb.control.send(Uint8Array.of(8));
    relay.advance();
    tb.tick();
    ta.tick();
    expect(batchSeqs(wa).slice(2)).toEqual([0, 1]); // The counter started again.
    expect(drain(tb)).toEqual([pkt(2, 0), pkt(2, 1)]);
    expect(drain(ta)).toEqual([pkt(2, 0)]);
    expect(tb.control.receive()).toEqual(Uint8Array.of(7));
    expect(ta.control.receive()).toEqual(Uint8Array.of(8));
    // A straggler of match 1 is dropped, not delivered.
    wb.serve(encodeFrame({ t: 'batch', seq: 2, packet: pkt(1, 9) }));
    wb.serve(encodeFrame({ t: 'pause', seq: 3, matchId: 1, flags: 1 }));
    expect(drain(tb)).toEqual([]);
    expect(tb.peerPause).toBeUndefined();
    expect(tb.staleMatch).toBe(2);
    // A result acknowledgement of the old match does not stop the current one's retry.
    ta.sendResult(2, 0, 0, 100, 5);
    wa.serve(resultAck(1));
    expect(a.events.filter((e) => e.t === 'result-ack')).toHaveLength(1);
    wa.serve(resultAck(2));
    expect(a.events.filter((e) => e.t === 'result-ack')).toHaveLength(2);
  });

  it('PEER_STATUS of another match is ignored', async () => {
    const { a, wa, h } = await pair();
    wa.serve(peerStatus(1, 0));
    wa.serve(peerStatus(7, 1));
    expect(a.events.filter((e) => e.t === 'peer')).toEqual([{ t: 'peer', matchId: 1, status: 'disconnected', graceMs: 10_000 }]);
    expect(h.svc.matchNo).toBe(1);
  });

  it('after a match the idle reconnect budget (60 s) applies again, not the in-match one (10 s)', async () => {
    const h = new Harness();
    const { c, events } = h.client();
    await Promise.all([c.connect(), h.flush()]);
    const w = h.svc.sockets[0] as TestWs;
    w.serve(matchStart(0, 1));
    w.serve(resultAck(1));
    h.svc.refuseSockets = 999;
    w.drop(1006);
    await h.step(30_000);
    expect(events.some((e) => e.t === 'closed')).toBe(false);
    await h.step(40_000);
    expect(events.at(-1)).toEqual({ t: 'closed', failure: { kind: 'network' } });
  });

  it('an unsolicited RESULT_ACK 2 (hash divergence, no RESULT sent) ends the match and is emitted', async () => {
    const { a, wa } = await pair();
    wa.serve(Uint8Array.of(0x51, 1, 2));
    expect(a.events.at(-1)).toEqual({ t: 'result-ack', matchId: 1, status: 2 });
    wa.serve(Uint8Array.of(0x51, 9, 2)); // Another match: ignored.
    expect(a.events.filter((e) => e.t === 'result-ack').length).toBe(1);
  });

  it('wraps the matchId 255 to 1: the next match plays', async () => {
    const h = new Harness();
    const { c, events } = h.client();
    await Promise.all([c.connect(), h.flush()]);
    const w = h.svc.sockets[0] as TestWs;
    w.serve(matchStart(0, 255));
    w.serve(resultAck(255));
    w.serve(matchStart(0, 1));
    expect(events.flatMap((e) => (e.t === 'match' ? [[e.matchId, e.resumed]] : []))).toEqual([[255, false], [1, false]]);
  });

  it('ERROR busy 0x0005 (queue cap) is an event and the link stays up', async () => {
    const h = new Harness();
    const { c, events } = h.client();
    await Promise.all([c.connect(), h.flush()]);
    (h.svc.sockets[0] as TestWs).serve(errorFrame(0x0005));
    expect(events.at(-1)).toMatchObject({ t: 'error', failure: { kind: 'server', code: 5 } });
    expect(events.some((e) => e.t === 'closed')).toBe(false);
  });

  it('a takeover closes the old socket with 1000: not an error and no reconnect or end', async () => {
    const h = new Harness();
    const { c, events } = h.client();
    await Promise.all([c.connect(), h.flush()]);
    (h.svc.sockets[0] as TestWs).drop(1006);
    await h.step(0);
    await h.step(1000);
    const n = h.svc.sockets.length;
    (h.svc.sockets[0] as TestWs).emit('close', { code: 1000 });
    await h.step(5000);
    expect(h.svc.sockets.length).toBe(n);
    expect(events.some((e) => e.t === 'closed' || e.t === 'error')).toBe(false);
  });

  it('joining the queue again also ends the in-match state', async () => {
    const h = new Harness();
    const { c, events } = h.client();
    await Promise.all([c.connect(), h.flush()]);
    (h.svc.sockets[0] as TestWs).serve(matchStart(0, 1));
    c.createRoom();
    h.svc.refuseSockets = 999;
    (h.svc.sockets[0] as TestWs).drop(1006);
    await h.step(30_000);
    expect(events.some((e) => e.t === 'closed')).toBe(false);
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
