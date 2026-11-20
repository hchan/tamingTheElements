import { afterEach, describe, expect, it } from 'vitest';
import { closeCodeFor, ErrorCode, FrameType } from '../../../core/relay';
import { PROTOCOL_VERSION, type OnlineEvent, type OnlineFailure } from '../../../game/net/ws/online-client';
import { encodeFrame } from '../../../game/net/ws/wire';
import { matchStart, peerStatus, pkt, resultAck } from '../fake-online-service';
import { GOLDEN_BATCHES, TEST_MATCH_ID, TEST_RESTING_SEC } from './constants';
import { IntHarness } from './harness';
import { startWsServer, type Delivery, type WsServer } from './server';

/** OnlineClient against a real `ws` server: the pins of today's behaviour (G1-G5). Known client defects land later as `it.fails`, one per review item 1-4. */

let srv: WsServer | undefined;
let h: IntHarness | undefined;

async function boot(delivery: Delivery = 'text'): Promise<{ srv: WsServer; h: IntHarness }> {
  srv = await startWsServer({ backend: 'fake', delivery });
  h = new IntHarness(srv);
  return { srv, h };
}

afterEach(async () => {
  await h?.close();
  await srv?.close();
  h = undefined;
  srv = undefined;
});

const kinds = (events: readonly OnlineEvent[]): string[] => events.map((e) => e.t);

describe('OnlineClient over real sockets', () => {
  it('G1 golden path: ticket, HELLO, WELCOME, queue, MATCH_START, batches both ways, RESULT, RESULT_ACK', async () => {
    const { srv: s, h: x } = await boot();
    const { c, events } = x.client();
    const r = await c.connect();
    expect(r.ok).toBe(true);
    const conn = await x.conn(1);
    expect(s.http.log.map((l) => l.path)).toEqual(['/session', '/ticket']);
    expect(s.svc.hellos).toEqual([{ ver: PROTOCOL_VERSION, resume: 0 }]);

    expect(c.joinQueue()).toBe(true);
    await x.until(() => conn.framesOfType(FrameType.queueJoin).length === 1, 'queue join');
    await x.delivered(conn);
    expect(kinds(events)).toEqual(['queue']);

    conn.sendBytes(matchStart(0, TEST_MATCH_ID));
    await x.delivered(conn);
    expect(events.at(-1)).toMatchObject({ t: 'match', matchId: TEST_MATCH_ID, slot: 0 });

    for (let i = 0; i < GOLDEN_BATCHES; i++) {
      c.transport.send(pkt(TEST_MATCH_ID, i));
      conn.sendFrame({ t: 'batch', seq: i, packet: pkt(TEST_MATCH_ID, i) });
    }
    await x.until(() => conn.framesOfType(FrameType.batch).length === GOLDEN_BATCHES, 'client batches');
    await x.delivered(conn);
    const got: Uint8Array[] = [];
    for (let p = c.transport.receive(); p !== undefined; p = c.transport.receive()) got.push(p);
    expect(got).toHaveLength(GOLDEN_BATCHES);

    c.transport.sendResult(TEST_MATCH_ID, 0, 0, 100, 0xabcd);
    await x.until(() => conn.framesOfType(FrameType.result).length >= 1, 'result');
    conn.sendBytes(resultAck(TEST_MATCH_ID));
    await x.delivered(conn);
    expect(events.at(-1)).toEqual({ t: 'result-ack', matchId: TEST_MATCH_ID, status: 0 });
    expect(c.transport.malformed).toBe(0);
    expect(x.rawIn.every((t) => !t.binary)).toBe(true);
  });

  it('G2 an HTTP 503 with body code resting and retryAfterSec is the kill switch: no HTTP until the time passed', async () => {
    const { srv: s, h: x } = await boot();
    s.http.override('/session', { status: 503, body: { error: 'x', code: ErrorCode.resting, retryAfterSec: TEST_RESTING_SEC }, once: true });
    const { c } = x.client();
    const first = await c.connect();
    expect(first).toEqual({ ok: false, failure: { kind: 'resting', retryAfterSec: TEST_RESTING_SEC } satisfies OnlineFailure });
    const calls = s.http.log.length;
    expect(calls).toBe(1);
    const during = await c.connect();
    expect(during.ok).toBe(false);
    expect(s.http.log).toHaveLength(calls);
    await x.step(TEST_RESTING_SEC * 1000);
    expect((await c.connect()).ok).toBe(true);
    expect(s.http.log.length).toBeGreaterThan(calls);
  });

  it('G3 an upgrade refused with 403 is a network failure after one fresh-ticket retry', async () => {
    const { srv: s, h: x } = await boot();
    s.refuseUpgrade = 403;
    const { c } = x.client();
    const r = await c.connect();
    expect(r).toEqual({ ok: false, failure: { kind: 'network' } });
    expect(s.http.log.filter((l) => l.path === '/ticket')).toHaveLength(2);
    expect(s.upgrades.map((u) => u.accepted)).toEqual([false, false]);
  });

  it('G4 close before WELCOME: 4003 is update-needed without retry; 4011 with no frame is resting 0, and the next connect asks HTTP again', async () => {
    const { srv: s, h: x } = await boot();
    s.intercept = (conn) => { conn.close(closeCodeFor(ErrorCode.versionMismatch)); return true; };
    const a = x.client();
    expect(await a.c.connect()).toEqual({ ok: false, failure: { kind: 'update-needed' } });
    expect(s.upgrades).toHaveLength(1);

    s.intercept = (conn) => { conn.close(closeCodeFor(ErrorCode.resting)); return true; };
    const b = x.client();
    expect(await b.c.connect()).toEqual({ ok: false, failure: { kind: 'resting', retryAfterSec: 0 } });
    const tickets = s.http.log.filter((l) => l.path === '/ticket').length;
    s.intercept = undefined;
    expect((await b.c.connect()).ok).toBe(true);
    expect(s.http.log.filter((l) => l.path === '/ticket').length).toBeGreaterThan(tickets);
  });

  it('G5 raw non-ASCII binary in a match is malformed 1 and the link keeps working', async () => {
    const { h: x } = await boot();
    const { c, events } = x.client();
    expect((await c.connect()).ok).toBe(true);
    const conn = await x.conn(1);
    conn.sendBytes(matchStart(0, TEST_MATCH_ID));
    await x.delivered(conn);
    conn.sendRawBinary(encodeFrame({ t: 'batch', seq: 0, packet: Uint8Array.of(0xff, 0xfe, 0xfd) }));
    await x.delivered(conn);
    expect(c.transport.malformed).toBe(1);
    expect(x.rawIn.at(-1)?.binary).toBe(true);
    conn.sendFrame({ t: 'batch', seq: 0, packet: pkt(TEST_MATCH_ID, 7) });
    conn.sendBytes(peerStatus(TEST_MATCH_ID, 0));
    await x.delivered(conn);
    expect(c.transport.receive()).toEqual(pkt(TEST_MATCH_ID, 7));
    expect(c.transport.malformed).toBe(1);
    expect(kinds(events)).toContain('peer');
  });

  it('harness self-check: the relay backend (RelayCore) answers HELLO and a queue join over the same sockets', async () => {
    srv = await startWsServer({ backend: 'relay' });
    h = new IntHarness(srv);
    const { c, events } = h.client();
    expect((await c.connect()).ok).toBe(true);
    expect(c.joinQueue()).toBe(true);
    await h.until(() => events.some((e) => e.t === 'queue'), 'queue state from RelayCore');
    await srv.advance(1000);
    expect(srv.clock.ms).toBeGreaterThan(0);
  });
});
