import { CHAT_BURST, CHAT_DETAIL_TAG, CHAT_LIMIT_CODE, CHAT_MAX_BYTES, CHAT_MAX_PER_SENDER, CHAT_TYPE, CHAT_UNDELIVERED_CODE } from './chat-rules';
import { encodeFrame, type Frame } from './codec';
import { ErrorCode, ResultStatus } from './constants';
import { check, eq, expectErrorClose, join, matched, testCase, type Ctx, type Peer } from './conformance-helpers';
import { skip, toHex, type ConformanceCase, type ConformanceHooks } from './conformance-kit';

// Chat (docs/ONLINE-PROTOCOL.md 4a). Every case skips unless WELCOME caps bit0 is set, so a relay with chat off passes the suite.

const SPEC = '4a';
const utf8 = (s: string): Uint8Array => Uint8Array.from(s, (ch) => ch.charCodeAt(0));
const line = (match: number, seq: number, text: string): Frame => ({ t: 'chat', match, seq, bytes: utf8(text) });
const tagged = (seq: number): number => (CHAT_DETAIL_TAG << 8) | seq;

/** A matched pair on a relay that advertises chat; skips otherwise. Returns [slot 0, slot 1, matchId]. */
async function chatPair(c: Ctx): Promise<[Peer, Peer, number]> {
  const [, w] = await join(c);
  if ((w.frame.caps & 1) === 0) return skip('relay has chat off (WELCOME caps bit0 is 0)');
  const [a, b, ma] = await matched(c);
  return [a, b, ma.frame.matchId];
}

const chatCase = (
  id: string,
  title: string,
  body: (a: Peer, b: Peer, match: number, hooks: ConformanceHooks) => Promise<void>,
): ConformanceCase =>
  testCase(`chat.${id}`, SPEC, title, async (c, hooks) => {
    const [a, b, match] = await chatPair(c);
    await body(a, b, match, hooks);
  });

export const chatCases: readonly ConformanceCase[] = [
  chatCase('forward', 'a line reaches the peer byte for byte and is not echoed to the sender', async (a, b, match) => {
    const f = line(match, 0, 'hi');
    await a.send(f);
    eq(toHex((await b.take('chat')).raw), toHex(encodeFrame(f)), 'forwarded bytes');
    await a.none('chat');
    await a.none('error');
    const back = line(match, 0, 'yo');
    await b.send(back);
    eq(toHex((await a.take('chat')).raw), toHex(encodeFrame(back)), 'reverse direction');
  }),
  chatCase('bad-text', 'all-blank text gets a tagged ERROR bad-frame (detail 0x70 << 8 | seq), the socket stays open', async (a, b, match) => {
    await a.send(line(match, 5, '   '));
    const e = await a.take('error', (x) => x.code === ErrorCode.badFrame);
    eq(e.frame.detail, tagged(5), 'detail');
    await a.open();
    await a.send({ t: 'ping', nonce: 9 });
    eq((await a.take('pong')).frame.nonce, 9, 'still served');
    eq(await b.drain('chat'), 0, 'forwarded lines');
  }),
  chatCase('rate', 'a burst is cut by a tagged ERROR rate-limited with retryAfterSec >= 1; the socket stays open', async (a, b, match) => {
    for (let i = 0; i < CHAT_BURST + 2; i++) await a.send(line(match, i, 'x'));
    const e = await a.take('error', (x) => x.code === ErrorCode.rateLimited);
    check(e.frame.retryAfterSec >= 1, 'retryAfterSec must be at least 1');
    check(e.frame.detail >> 8 === CHAT_DETAIL_TAG, 'error is tagged with the chat line');
    const n = await b.drain('chat');
    // [estimate: real-relay timing] a slow link may refill one token mid-burst
    check(n >= CHAT_BURST && n <= CHAT_BURST + 1, `expected ${String(CHAT_BURST)} or ${String(CHAT_BURST + 1)} forwarded lines, got ${String(n)}`);
    await a.open();
  }),
  chatCase('oversize', `a line over ${String(CHAT_MAX_BYTES)} bytes is ERROR too-big and close 4002`, async (a, _b, match) => {
    const n = CHAT_MAX_BYTES + 1;
    const raw = new Uint8Array(4 + n).fill(0x61);
    raw.set([CHAT_TYPE, match, 0, n], 0);
    await a.raw(raw);
    await expectErrorClose(a, ErrorCode.tooBig);
  }),
  chatCase('stale-match', 'a line for another match id is dropped silently (no frame to either side, socket open)', async (a, b, match) => {
    await a.send(line((match + 1) & 0xff, 0, 'hi'));
    await a.none();
    eq(await b.drain('chat'), 0, 'forwarded lines');
    await a.open();
  }),
  chatCase('limit', `line ${String(CHAT_MAX_PER_SENDER + 1)} in one match gets a tagged ERROR 0x000D (chat limit)`, async (a, b, match, hooks) => {
    if (hooks.advanceTime === undefined) return skip('needs hooks.advanceTime');
    for (let i = 0; i < CHAT_MAX_PER_SENDER; i++) {
      await hooks.advanceTime(1000);
      await a.send(line(match, i, 'x'));
    }
    await hooks.advanceTime(1000);
    await a.send(line(match, CHAT_MAX_PER_SENDER, 'x'));
    const e = await a.take('error', (x) => x.code === CHAT_LIMIT_CODE);
    eq(e.frame.detail, tagged(CHAT_MAX_PER_SENDER), 'detail');
    eq(await b.drain('chat'), CHAT_MAX_PER_SENDER, 'forwarded lines');
    await a.open();
  }),
  chatCase('undelivered', 'a line while the peer is gone gets a tagged ERROR 0x000E (undelivered); the sender stays open', async (a, b, match) => {
    await b.client.close();
    await a.take('peerStatus'); // the relay has seen the drop (a real socket closes asynchronously)
    await a.send(line(match, 3, 'anyone?'));
    const e = await a.take('error', (x) => x.code === CHAT_UNDELIVERED_CODE);
    eq(e.frame.detail, tagged(3), 'detail');
    await a.open();
  }),
  chatCase('after-result', 'chat still flows both ways after both RESULTs are agreed', async (a, b, match) => {
    const r: Frame = { t: 'result', seq: 1, matchId: match, winner: 1, reason: 0, ticks: 4000, finalHash: 0xabcdef };
    await a.send(r);
    await b.send(r);
    await a.take('resultAck', (x) => x.status === ResultStatus.agreed);
    await b.take('resultAck', (x) => x.status === ResultStatus.agreed);
    await a.send(line(match, 0, 'gg'));
    await b.take('chat');
    await b.send(line(match, 0, 'gg'));
    await a.take('chat');
  }),
];
