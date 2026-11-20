import { afterEach, describe, expect, it } from 'vitest';
import { ErrorCode, FrameType } from '../../../core/relay';
import type { OnlineEvent } from '../../../game/net/ws/online-client';
import { encodeFrame } from '../../../game/net/ws/wire';
import { matchStart, peerStatus, pkt, resultAck } from '../fake-online-service';
import { GOLDEN_BATCHES, TEST_MATCH_ID } from './constants';
import { IntHarness } from './harness';
import { startWsServer, type Delivery, type WsServer } from './server';

/** Review item 2: a backend may send the base64 text of a frame inside a BINARY WebSocket message (docs/ONLINE-PROTOCOL.md). Real sockets, undici WebSocket. */

let srv: WsServer | undefined;
let h: IntHarness | undefined;

async function boot(delivery: Delivery): Promise<{ srv: WsServer; h: IntHarness }> {
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

describe('OnlineClient with ASCII binary frames', () => {
  it('2a handshake and a short exchange complete over binary frames, malformed 0', async () => {
    const { h: x } = await boot('ascii-binary');
    const { c, events } = x.client();
    expect((await c.connect()).ok).toBe(true);
    expect(x.rawIn.length).toBeGreaterThan(0);
    expect(x.rawIn.every((t) => t.binary)).toBe(true);
    const conn = await x.conn(1);
    expect(c.joinQueue()).toBe(true);
    await x.until(() => conn.framesOfType(FrameType.queueJoin).length === 1, 'queue join');
    await x.delivered(conn);

    conn.sendBytes(matchStart(0, TEST_MATCH_ID));
    await x.delivered(conn);
    expect(events.at(-1)).toMatchObject({ t: 'match', matchId: TEST_MATCH_ID, slot: 0 });
    for (let i = 0; i < GOLDEN_BATCHES; i++) conn.sendFrame({ t: 'batch', seq: i, packet: pkt(TEST_MATCH_ID, i) });
    conn.sendBytes(peerStatus(TEST_MATCH_ID, 0));
    await x.delivered(conn);
    let n = 0;
    for (let p = c.transport.receive(); p !== undefined; p = c.transport.receive()) n++;
    expect(n).toBe(GOLDEN_BATCHES);
    expect(kinds(events)).toContain('peer');

    c.transport.ping();
    c.transport.sendResult(TEST_MATCH_ID, 0, 0, 100, 0xabcd);
    await x.until(() => conn.framesOfType(FrameType.result).length >= 1, 'result');
    conn.sendBytes(resultAck(TEST_MATCH_ID));
    await x.delivered(conn);
    expect(events.at(-1)).toEqual({ t: 'result-ack', matchId: TEST_MATCH_ID, status: 0 });
    expect(c.transport.malformed).toBe(0);
  });

  it('2c a binary frame and the text frame after it are handled in send order', async () => {
    const { srv: s, h: x } = await boot('ascii-binary');
    const { c, events } = x.client();
    expect((await c.connect()).ok).toBe(true);
    const conn = await x.conn(1);
    conn.sendBytes(matchStart(0, TEST_MATCH_ID));
    await x.delivered(conn);

    conn.sendFrame({ t: 'error', code: ErrorCode.noRoom, retryAfterSec: 0, detail: 0 });
    s.delivery = 'text';
    conn.sendFrame({ t: 'error', code: ErrorCode.full, retryAfterSec: 0, detail: 0 });
    await x.delivered(conn);
    expect(c.transport.lastError?.code).toBe(ErrorCode.full);

    s.delivery = 'ascii-binary';
    conn.sendBytes(resultAck(TEST_MATCH_ID));
    s.delivery = 'text';
    conn.sendBytes(peerStatus(TEST_MATCH_ID, 0));
    await x.delivered(conn);
    expect(kinds(events).slice(-2)).toEqual(['result-ack', 'peer']);
    expect(c.transport.malformed).toBe(0);
  });

  it('raw non-ASCII binary is still malformed, and the following binary text frame still arrives', async () => {
    const { h: x } = await boot('ascii-binary');
    const { c } = x.client();
    expect((await c.connect()).ok).toBe(true);
    const conn = await x.conn(1);
    conn.sendBytes(matchStart(0, TEST_MATCH_ID));
    await x.delivered(conn);
    conn.sendRawBinary(encodeFrame({ t: 'batch', seq: 0, packet: Uint8Array.of(0xff, 0xfe, 0xfd) }));
    conn.sendFrame({ t: 'batch', seq: 0, packet: pkt(TEST_MATCH_ID, 3) });
    await x.delivered(conn);
    expect(c.transport.malformed).toBe(1);
    expect(c.transport.receive()).toEqual(pkt(TEST_MATCH_ID, 3));
  });

  it('text delivery is unchanged: no binary message, malformed 0', async () => {
    const { h: x } = await boot('text');
    const { c } = x.client();
    expect((await c.connect()).ok).toBe(true);
    const conn = await x.conn(1);
    conn.sendBytes(matchStart(0, TEST_MATCH_ID));
    conn.sendFrame({ t: 'batch', seq: 0, packet: pkt(TEST_MATCH_ID, 1) });
    await x.delivered(conn);
    expect(x.rawIn.every((t) => !t.binary)).toBe(true);
    expect(c.transport.receive()).toEqual(pkt(TEST_MATCH_ID, 1));
    expect(c.transport.malformed).toBe(0);
  });
});
