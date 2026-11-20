import { afterEach, describe, expect, it } from 'vitest';
import { NOTICE_TEXT_MAX } from '../../../game/net/ws/inbound';
import type { OnlineEvent } from '../../../game/net/ws/online-client';
import { matchStart, pkt } from '../fake-online-service';
import { GatewayNotice, TEST_MATCH_ID } from './constants';
import { IntHarness } from './harness';
import { startWsServer, type ServerConn, type WsServer } from './server';

/** Review item 3: a gateway failure notice (plain text or a small JSON) is a visible `gateway-notice` event, never a malformed frame. Real sockets. */

let srv: WsServer | undefined;
let h: IntHarness | undefined;

afterEach(async () => {
  await h?.close();
  await srv?.close();
  h = undefined;
  srv = undefined;
});

/** [choice] Factor by which the over-long notice exceeds NOTICE_TEXT_MAX. */
const LONG_FACTOR = 3;

const notices = (events: readonly OnlineEvent[]): OnlineEvent[] => events.filter((e) => e.t === 'gateway-notice');

async function inMatch(): Promise<{ x: IntHarness; c: ReturnType<IntHarness['client']>['c']; events: OnlineEvent[]; conn: ServerConn }> {
  srv = await startWsServer({ backend: 'fake' });
  h = new IntHarness(srv);
  const { c, events } = h.client();
  expect((await c.connect()).ok).toBe(true);
  const conn = await h.conn(1);
  conn.sendBytes(matchStart(0, TEST_MATCH_ID));
  await h.delivered(conn);
  return { x: h, c, events, conn };
}

describe('gateway notices in a match', () => {
  for (const form of ['plain', 'json'] as const) {
    for (const binary of [false, true]) {
      it(`${form} notice (${binary ? 'binary' : 'text'}) is an event, malformed stays 0, the match goes on`, async () => {
        const { x, c, events, conn } = await inMatch();
        conn.sendNotice(form, GatewayNotice.throttled, binary);
        conn.sendFrame({ t: 'batch', seq: 0, packet: pkt(TEST_MATCH_ID, 1) });
        await x.delivered(conn);
        expect(notices(events)).toEqual([{ t: 'gateway-notice', text: GatewayNotice.throttled }]);
        expect(c.transport.malformed).toBe(0);
        expect(c.transport.closed).toBe(false);
        expect(events.some((e) => e.t === 'closed')).toBe(false);
        expect(c.transport.receive()).toEqual(pkt(TEST_MATCH_ID, 1));
      });
    }
  }

  it('a genuinely corrupt frame still counts malformed and gives no notice', async () => {
    const { x, c, events, conn } = await inMatch();
    conn.sendNotice('plain', 'zz');
    conn.sendRawBinary(Uint8Array.of(0xff, 0xfe, 0xfd, 0xfc));
    await x.delivered(conn);
    expect(c.transport.malformed).toBe(2);
    expect(notices(events)).toEqual([]);
  });

  it('an over-long notice text is truncated to NOTICE_TEXT_MAX', async () => {
    const { x, c, events, conn } = await inMatch();
    conn.sendNotice('plain', `Internal ${'x'.repeat(NOTICE_TEXT_MAX * LONG_FACTOR)}`);
    await x.delivered(conn);
    expect(notices(events)).toEqual([{ t: 'gateway-notice', text: `Internal ${'x'.repeat(NOTICE_TEXT_MAX)}`.slice(0, NOTICE_TEXT_MAX) }]);
    expect(c.transport.malformed).toBe(0);
  });
});

describe('gateway notice during the handshake', () => {
  it('a notice instead of WELCOME fails the attempt fast, as an event and not as a malformed frame', async () => {
    srv = await startWsServer({ backend: 'fake' });
    h = new IntHarness(srv);
    const { c, events } = h.client();
    srv.intercept = (conn) => { conn.sendNotice('plain'); return true; }; // The notice answers HELLO.
    const p = c.connect();
    const r = await p;
    expect(r.ok).toBe(false);
    expect(srv.conns.length).toBeGreaterThan(0); // One notice per attempt (connect retries with a fresh ticket).
    expect(notices(events)).toEqual(srv.conns.map(() => ({ t: 'gateway-notice', text: GatewayNotice.internal })));
    expect(c.transport.malformed).toBe(0);
  });
});
