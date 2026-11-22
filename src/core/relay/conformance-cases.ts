import { decodeFrame, encodeFrame, type Frame } from './codec';
import {
  ErrorCode,
  PeerStatusEvent,
  PROTOCOL_VERSION,
  ResultStatus,
  RoomPeerEvent,
} from './constants';
import { fromHex, goldenFrames, skip, toHex, type ConformanceCase } from './conformance-kit';
import {
  batchFrame,
  check,
  connect,
  eq,
  expectBadFrame,
  expectErrorClose,
  join,
  matched,
  num,
  same,
  str,
  testCase,
} from './conformance-helpers';
import { CODE_ALPHABET, CODE_LENGTH } from './rooms-rules';
import { ReorderBuffer } from './seq';
import { decodeText, encodeText } from './text-codec';

// ---- cases --------------------------------------------------------------------------------------------------------------------

const wire: ConformanceCase[] = goldenFrames.map((g) => ({
  id: `wire.golden.${g.id}`,
  spec: '4',
  title: `${g.id} encodes to the spec bytes and decodes back`,
  run(): Promise<void> {
    const bytes = fromHex(g.hex);
    check(toHex(encodeFrame(g.frame)) === toHex(bytes), `${g.id} encoding differs from the golden bytes`);
    const d = decodeFrame(bytes);
    check(d.ok, `${g.id} golden bytes do not decode`);
    if (d.ok) eq(JSON.stringify(d.frame, (_k, v: unknown) => (v instanceof Uint8Array ? toHex(v) : v)),
      JSON.stringify(g.frame, (_k, v: unknown) => (v instanceof Uint8Array ? toHex(v) : v)), `${g.id} decoded`);
    return Promise.resolve();
  },
}));

const wireText: ConformanceCase[] = goldenFrames.map((g) => ({
  id: `wire.text.${g.id}`,
  spec: '4',
  title: `${g.id} travels as the golden base64 text and decodes back to the same bytes`,
  run(): Promise<void> {
    const bytes = fromHex(g.hex);
    eq(encodeText(bytes), g.text, `${g.id} base64 text`);
    const back = decodeText(g.text);
    check(back !== undefined && same(back, bytes), `${g.id} golden text does not decode to the golden bytes`);
    return Promise.resolve();
  },
}));

const hello: ConformanceCase[] = [
  testCase('hello.welcome', '3,4', 'HELLO is answered by WELCOME (version, nonzero session id, serverHint 64, resumed 0)', async (c) => {
    const [, w] = await join(c);
    eq([w.frame.ver, w.frame.resumed, w.frame.serverHint], [PROTOCOL_VERSION, 0, 64], 'welcome');
    check(w.frame.caps === 0 || w.frame.caps === 1, 'welcome caps (byte 7) must be 0 or 1');
    check(w.frame.sessionId > 0, 'session id must be nonzero (0 means "new" in HELLO.resumeSession)');
  }),
  testCase('hello.session-ids-differ', '4', 'two connections get different session ids', async (c) => {
    const [, a] = await join(c);
    const [, b] = await join(c);
    check(a.frame.sessionId !== b.frame.sessionId, 'duplicate session id');
  }),
  testCase('hello.ping-pong', '4', 'PING is answered by PONG echoing the nonce', async (c) => {
    const [p] = await join(c);
    await p.send({ t: 'ping', nonce: 0xdeadbeef });
    eq((await p.take('pong')).frame.nonce, 0xdeadbeef, 'nonce');
  }),
  testCase('version.mismatch', '2', 'a different protocol version gets ERROR version-mismatch (detail = server version) and close 4003', async (c) => {
    const p = await connect(c);
    await p.send({ t: 'hello', ver: PROTOCOL_VERSION + 1, simVersion: c.env.sim, resumeSession: 0 });
    const e = await expectErrorClose(p, ErrorCode.versionMismatch);
    eq(e.frame.detail, PROTOCOL_VERSION, 'detail carries the server version');
  }),
  testCase('version.mismatch-zero', '2', 'version 0 is a mismatch too (exact match rule)', async (c) => {
    const p = await connect(c);
    await p.send({ t: 'hello', ver: 0, simVersion: c.env.sim, resumeSession: 0 });
    await expectErrorClose(p, ErrorCode.versionMismatch);
  }),
];

const bytes = (...n: number[]): Uint8Array => Uint8Array.from(n);
const zeros = (type: number, total: number): Uint8Array => {
  const b = new Uint8Array(total);
  b[0] = type;
  return b;
};
const malformed = (id: string, title: string, frame: () => Uint8Array, code: number): ConformanceCase =>
  testCase(`malformed.${id}`, '4,5', title, async (c) => {
    const [p] = await join(c);
    await p.raw(frame());
    await expectErrorClose(p, code);
  });

const frames: ConformanceCase[] = [
  malformed('empty', 'an empty binary frame is ERROR bad-frame and close 4001', () => new Uint8Array(0), ErrorCode.badFrame),
  malformed('unknown-type', 'an unknown type byte is ERROR bad-frame and close 4001', () => bytes(0x99, 1, 2), ErrorCode.badFrame),
  malformed('wrong-length', 'a fixed frame with the wrong length is bad-frame (PING with 3 bytes)', () => bytes(0x60, 0, 0), ErrorCode.badFrame),
  malformed('wrong-direction', 'a server-to-client type from a client is bad-frame (PONG)', () => bytes(0x61, 0, 0, 0, 1), ErrorCode.badFrame),
  malformed('room-code-chars', 'a ROOM_JOIN code with control bytes is bad-frame', () => bytes(0x22, 0, 0, 0, 0, 0, 0), ErrorCode.badFrame),
  malformed('batch-layout', 'a BATCH whose Packet length disagrees with its counts is bad-frame', () => bytes(0x40, 0, 0, 0, 0, ...fromHex('01 00 00000000 00000000 05 0000 00')), ErrorCode.badFrame),
  malformed('batch-too-big', 'a BATCH over 305 bytes is too-big and close 4002', () => zeros(0x40, 306), ErrorCode.tooBig),
  malformed('setup-too-big', 'a SETUP over 410 bytes is too-big and close 4002', () => zeros(0x31, 411), ErrorCode.tooBig),
  malformed('fixed-too-big', 'a fixed frame over its cap is too-big (PING with 6 bytes)', () => bytes(0x60, 0, 0, 0, 0, 0), ErrorCode.tooBig),
  testCase('malformed.binary', '1,5', 'a BINARY message is ERROR bad-frame and close 4001 (advisory)', async (c) => {
    const [p] = await join(c);
    if (p.client.sendBinary === undefined) return skip('adapter cannot send binary messages');
    await p.client.sendBinary(encodeFrame({ t: 'ping', nonce: 1 }));
    await expectBadFrame(p);
  }),
  testCase('malformed.not-base64', '1,5', 'a text message that is not standard base64 is ERROR bad-frame', async (c) => {
    const [p] = await join(c);
    await p.client.sendText('hello!');
    await expectBadFrame(p);
  }),
  testCase('malformed.base64-whitespace', '1,5', 'base64 text with a line break is ERROR bad-frame', async (c) => {
    const [p] = await join(c);
    await p.client.sendText(`${encodeText(encodeFrame({ t: 'ping', nonce: 1 }))}\n`);
    await expectBadFrame(p);
  }),
  testCase('setup.max-blob', '4', 'a SETUP with the maximum 401-byte blob is relayed, not rejected', async (c) => {
    const [a, b] = await matched(c);
    const f = encodeFrame({ t: 'setup', seq: 0, ctlSeq: 0, ackCtl: 0xff, blob: new Uint8Array(401).fill(7) });
    check(f.length === 410, 'test frame must be 410 bytes');
    await a.raw(f);
    check(same((await b.take('setup')).raw, f), 'SETUP relayed unchanged');
    await a.open();
  }),
];

const queue: ConformanceCase[] = [
  testCase('queue.join-alone', '4', 'QUEUE_JOIN alone is answered by QUEUE_STATE (waiting 0)', async (c) => {
    const [a] = await join(c);
    await a.send({ t: 'queueJoin', mode: 0 });
    eq((await a.take('queueState')).frame.waitingSec, 0, 'waitingSec');
    await a.none('matchStart');
  }),
  testCase('queue.pairing', '4,6', 'two queued players get MATCH_START with distinct slots, one seed, one matchId; the longest waiter is slot 0', async (c) => {
    const [, , ma, mb] = await matched(c);
    eq(
      [ma.frame.seed, ma.frame.matchId, ma.frame.simVersion, ma.frame.inputDelay, ma.frame.batchEvery],
      [mb.frame.seed, mb.frame.matchId, mb.frame.simVersion, mb.frame.inputDelay, mb.frame.batchEvery],
      'shared match parameters',
    );
    eq(ma.frame.simVersion, c.env.sim, 'simVersion echoes HELLO');
    check(ma.frame.batchEvery >= 1, 'batchEvery >= 1');
  }),
  testCase('queue.leave', '4', 'after QUEUE_LEAVE the player is not matched', async (c) => {
    const [a] = await join(c);
    const [b] = await join(c);
    await a.send({ t: 'queueJoin', mode: 0 });
    await a.take('queueState');
    await a.send({ t: 'queueLeave' });
    await b.send({ t: 'queueJoin', mode: 0 });
    await b.take('queueState');
    await a.none('matchStart');
    await b.none('matchStart');
  }),
  testCase('queue.disconnect-leaves', '6', 'a queued player who disconnects is not matched later', async (c) => {
    const [a] = await join(c);
    await a.send({ t: 'queueJoin', mode: 0 });
    await a.take('queueState');
    await a.client.close();
    const [b] = await join(c);
    await b.send({ t: 'queueJoin', mode: 0 });
    await b.take('queueState');
    await b.none('matchStart');
  }),
  testCase('queue.busy', '5', 'QUEUE_JOIN while queued is ERROR busy', async (c) => {
    const [a] = await join(c);
    await a.send({ t: 'queueJoin', mode: 0 });
    await a.take('queueState');
    await a.send({ t: 'queueJoin', mode: 0 });
    await a.take('error', (e) => e.code === ErrorCode.busy);
  }),
];

const rooms: ConformanceCase[] = [
  testCase('room.create', '4', 'ROOM_CREATE answers a 6-character code from the alphabet and ttlSec 600', async (c) => {
    const [a] = await join(c);
    await a.send({ t: 'roomCreate' });
    const r = (await a.take('roomCreated')).frame;
    eq(r.code.length, CODE_LENGTH, 'code length');
    check(r.code.split('').every((ch) => CODE_ALPHABET.includes(ch)), `code ${r.code} outside the alphabet`);
    eq(r.ttlSec, 600, 'room life 10 min');
  }),
  testCase('room.join', '4', 'a guest joining by (lower-case) code starts the match: host slot 0, ROOM_PEER joined to the host', async (c) => {
    const [h] = await join(c);
    const [g] = await join(c);
    await h.send({ t: 'roomCreate' });
    const code = (await h.take('roomCreated')).frame.code;
    await g.raw(Uint8Array.from([0x22, ...code.toLowerCase().split('').map((ch) => ch.charCodeAt(0))]));
    eq((await h.take('roomPeer')).frame.event, RoomPeerEvent.joined, 'roomPeer event');
    const [mh, mg] = [await h.take('matchStart'), await g.take('matchStart')];
    eq([mh.frame.slot, mg.frame.slot], [0, 1], 'slots');
    eq(mh.frame.seed, mg.frame.seed, 'shared seed');
  }),
  testCase('room.no-room', '5', 'joining an unknown code is ERROR no-room', async (c) => {
    const [g] = await join(c);
    await g.send({ t: 'roomJoin', code: 'ZZZZZZ' });
    await g.take('error', (e) => e.code === ErrorCode.noRoom);
  }),
  testCase('room.sim-mismatch', '2,5', 'a guest with another simVersion is ERROR sim-mismatch', async (c) => {
    const [h] = await join(c);
    const [g] = await join(c, c.env.sim + 1);
    await h.send({ t: 'roomCreate' });
    await g.send({ t: 'roomJoin', code: (await h.take('roomCreated')).frame.code });
    await g.take('error', (e) => e.code === ErrorCode.simMismatch);
  }),
  testCase('room.busy', '5', 'ROOM_CREATE while already in a room is ERROR busy', async (c) => {
    const [h] = await join(c);
    await h.send({ t: 'roomCreate' });
    await h.take('roomCreated');
    await h.send({ t: 'roomCreate' });
    await h.take('error', (e) => e.code === ErrorCode.busy);
  }),
];

const match: ConformanceCase[] = [
  testCase('batch.relay', '4,6', 'BATCH reaches the peer byte for byte (seq untouched) in both directions and is not echoed', async (c) => {
    const [a, b, ma] = await matched(c);
    const f = encodeFrame(batchFrame(12345, ma.frame.matchId));
    await a.raw(f);
    check(same((await b.take('batch')).raw, f), 'a to b changed the bytes');
    const g = encodeFrame(batchFrame(7, ma.frame.matchId));
    await b.raw(g);
    check(same((await a.take('batch')).raw, g), 'b to a changed the bytes');
    await a.none('batch');
    await b.none('batch');
  }),
  testCase('batch.unordered-duplicates', '1,6', 'out-of-order and duplicated BATCHes keep their seq; a ReorderBuffer delivers each once, in order', async (c) => {
    const [a, b, ma] = await matched(c);
    for (const s of [1, 0, 2, 2, 0, 3]) await a.send(batchFrame(s, ma.frame.matchId));
    const got: number[] = [];
    for (let i = 0; i < 6; i++) got.push((await b.take('batch')).frame.seq);
    eq([...got].sort(num), [0, 0, 1, 2, 2, 3], 'received seqs (relay may reorder or dedupe nothing, never renumber)');
    const rb = new ReorderBuffer<number>();
    const delivered = got.flatMap((s) => rb.push(s, s, 0));
    eq(delivered.sort(num), [0, 1, 2, 3], 'delivered once each');
  }),
  testCase('batch.seq-and-setup-independent', '6', 'SETUP frames are relayed unchanged and do not disturb BATCH seq', async (c) => {
    const [a, b, ma] = await matched(c);
    const s = encodeFrame({ t: 'setup', seq: 0, ctlSeq: 0, ackCtl: 0xff, blob: bytes(1, 2, 3) });
    await a.raw(s);
    await a.send(batchFrame(0, ma.frame.matchId));
    check(same((await b.take('setup')).raw, s), 'SETUP changed');
    eq((await b.take('batch')).frame.seq, 0, 'first BATCH is still seq 0');
  }),
  testCase('setup.ctl-stream', '6', 'SETUP control messages, duplicates and pure acks (n = 0, ackCtl) are relayed unchanged both ways', async (c) => {
    const [a, b] = await matched(c);
    const m = (ctlSeq: number, ackCtl: number, blob: number[]): Uint8Array =>
      encodeFrame({ t: 'setup', seq: 0, ctlSeq, ackCtl, blob: Uint8Array.from(blob) });
    const sent = [m(0, 0xff, [1, 9]), m(0, 0xff, [1, 9]), m(1, 0xff, [2, 8, 8])];
    for (const f of sent) await a.raw(f);
    const got = [await b.take('setup'), await b.take('setup'), await b.take('setup')].map((x) => toHex(x.raw));
    eq(got.sort(str), sent.map(toHex).sort(str), 'SETUP frames at b');
    const ack = m(0, 1, []);
    await b.raw(ack);
    const back = (await a.take('setup')).frame;
    eq([back.ackCtl, back.blob.length], [1, 0], 'pure ack');
  }),
  testCase('pause.relay', '4,6', 'PAUSE reaches the peer unchanged', async (c) => {
    const [a, b, ma] = await matched(c);
    const f = encodeFrame({ t: 'pause', seq: 4, matchId: ma.frame.matchId, flags: 1 });
    await a.raw(f);
    check(same((await b.take('pause')).raw, f), 'PAUSE changed');
  }),
  testCase('hash.consumed', '4', 'HASH is for the server only: nothing is relayed or answered, matching hashes keep the match alive', async (c) => {
    const [a, b, ma] = await matched(c);
    const id = ma.frame.matchId;
    await a.send({ t: 'hash', seq: 0, matchId: id, tick: 50, hash: 99 });
    await b.send({ t: 'hash', seq: 0, matchId: id, tick: 50, hash: 99 });
    await a.none();
    await b.none();
    await a.send({ t: 'result', seq: 1, matchId: id, winner: 0, reason: 0, ticks: 100, finalHash: 5 });
    await b.send({ t: 'result', seq: 1, matchId: id, winner: 0, reason: 0, ticks: 100, finalHash: 5 });
    eq((await b.take('resultAck')).frame.status, ResultStatus.agreed, 'status');
  }),
  testCase('desync.consumed', '4,6', 'DESYNC is accepted silently (not relayed, no error); a later RESULT is answered with the current status', async (c) => {
    const [a, b, ma] = await matched(c);
    const id = ma.frame.matchId;
    await a.send({ t: 'desync', seq: 0, matchId: id, tick: 100, localHash: 1, remoteHash: 2 });
    await a.none();
    await b.none();
    await a.send({ t: 'result', seq: 1, matchId: id, winner: 2, reason: 3, ticks: 100, finalHash: 1 });
    eq((await a.take('resultAck')).frame.matchId, id, 'RESULT after DESYNC is still answered');
    await a.open();
  }),
  testCase('result.agree', '4,6', 'agreeing RESULTs: first gets waiting, then both get agreed; a retry is answered with the current status', async (c) => {
    const [a, b, ma] = await matched(c);
    const id = ma.frame.matchId;
    const r = (seq: number): Frame => ({ t: 'result', seq, matchId: id, winner: 1, reason: 0, ticks: 4000, finalHash: 0xabcdef });
    await a.send(r(0));
    eq((await a.take('resultAck')).frame.status, ResultStatus.waiting, 'first submitter waits');
    await a.send(r(1));
    eq((await a.take('resultAck')).frame.status, ResultStatus.waiting, 'retry is answered with the current status');
    await b.send(r(0));
    eq((await b.take('resultAck')).frame.status, ResultStatus.agreed, 'b');
    eq((await a.take('resultAck')).frame.status, ResultStatus.agreed, 'a (second ack)');
    await a.send(r(2));
    eq((await a.take('resultAck', (x) => x.status === ResultStatus.agreed)).frame.matchId, id, 'late retry sees agreed');
  }),
  testCase('result.disagree', '4', 'different RESULTs (winner, ticks or finalHash) are RESULT_ACK disagreed for both', async (c) => {
    const [a, b, ma] = await matched(c);
    const id = ma.frame.matchId;
    await a.send({ t: 'result', seq: 0, matchId: id, winner: 0, reason: 0, ticks: 4000, finalHash: 1 });
    await a.take('resultAck');
    await b.send({ t: 'result', seq: 0, matchId: id, winner: 0, reason: 0, ticks: 4000, finalHash: 2 });
    eq((await b.take('resultAck')).frame.status, ResultStatus.disagreed, 'b');
    eq((await a.take('resultAck')).frame.status, ResultStatus.disagreed, 'a');
  }),
  testCase('match.two-in-a-row', '3,4,6', 'after RESULT agreed the same two connections queue again: a new matchId, seq restarts at 0, old-match frames are dropped', async (c) => {
    const [a, b, ma] = await matched(c);
    const id1 = ma.frame.matchId;
    const r = (id: number): Frame => ({ t: 'result', seq: 0, matchId: id, winner: 1, reason: 0, ticks: 4000, finalHash: 0xabcdef });
    await a.send(r(id1));
    await b.send(r(id1));
    await a.take('resultAck', (x) => x.status === ResultStatus.agreed);
    await b.take('resultAck', (x) => x.status === ResultStatus.agreed);
    await b.send({ t: 'queueJoin', mode: 0 });
    await b.take('queueState');
    await a.send({ t: 'queueJoin', mode: 0 });
    const [ma2, mb2] = [await a.take('matchStart'), await b.take('matchStart')];
    check(ma2.frame.matchId !== id1, 'matchId must change for the next match');
    eq(ma2.frame.matchId, mb2.frame.matchId, 'both sides get the same matchId');
    await a.send(batchFrame(0, id1));
    await a.none('batch');
    await b.none('batch');
    const f = encodeFrame(batchFrame(0, ma2.frame.matchId));
    const sender = ma2.frame.slot === 0 ? a : b;
    const receiver = ma2.frame.slot === 0 ? b : a;
    await sender.raw(f);
    check(same((await receiver.take('batch')).raw, f), 'seq 0 of the new match relayed unchanged');
  }),
  testCase('batch.far-ahead-seq', '6', 'a BATCH far ahead of the stream is relayed unchanged; the receiver drops it and keeps the stream', async (c) => {
    const [a, b, ma] = await matched(c);
    const id = ma.frame.matchId;
    await a.send(batchFrame(0, id));
    await a.send(batchFrame(0x7fffffff, id));
    await a.send(batchFrame(1, id));
    const got: number[] = [];
    for (let i = 0; i < 3; i++) got.push((await b.take('batch')).frame.seq);
    eq(got, [0, 0x7fffffff, 1], 'relayed unchanged and in order');
    const rb = new ReorderBuffer<number>();
    eq(got.flatMap((s) => rb.push(s, s, 0)), [0, 1], 'the far-ahead seq is dropped, the stream continues');
  }),
  testCase('hash-result.seq-ignored', '4,6', 'HASH and RESULT carry seq 0 and the relay ignores whatever seq they have', async (c) => {
    const [a, b, ma] = await matched(c);
    const id = ma.frame.matchId;
    for (const seq of [0, 9, 0xffffffff]) {
      await a.send({ t: 'hash', seq, matchId: id, tick: 50, hash: 5 });
      await b.send({ t: 'hash', seq, matchId: id, tick: 50, hash: 5 });
    }
    await a.none('resultAck');
    const r = (seq: number): Frame => ({ t: 'result', seq, matchId: id, winner: 1, reason: 0, ticks: 4000, finalHash: 1 });
    await a.send(r(777));
    eq((await a.take('resultAck')).frame.status, ResultStatus.waiting, 'a waits');
    await b.send(r(0));
    eq((await b.take('resultAck')).frame.status, ResultStatus.agreed, 'b agreed despite different seqs');
  }),
];

const resume: ConformanceCase[] = [
  testCase('resume.within-grace', '7', 'drop then HELLO with the session id inside the 10 s grace: PEER_STATUS 0 (graceMs 10000), WELCOME resumed 1, MATCH_START again, peer told "back"', async (c) => {
    const [a, b, ma, , [sidA]] = await matched(c);
    await a.client.close();
    const ps = (await b.take('peerStatus')).frame;
    eq([ps.event, ps.graceMs], [PeerStatusEvent.disconnected, 10000], 'peer status');
    const [a2, w] = await join(c, c.env.sim, sidA, a);
    eq([w.frame.resumed, w.frame.sessionId], [1, sidA], 'resumed welcome');
    const ms = (await a2.take('matchStart')).frame;
    eq([ms.matchId, ms.seed, ms.slot], [ma.frame.matchId, ma.frame.seed, ma.frame.slot], 'same match, seed, slot');
    eq((await b.take('peerStatus')).frame.event, PeerStatusEvent.back, 'peer back');
    const f = encodeFrame(batchFrame(100, ma.frame.matchId));
    await b.raw(f);
    check(same((await a2.take('batch')).raw, f), 'BATCH reaches the resumed connection');
    await a2.send(batchFrame(50, ma.frame.matchId));
    eq((await b.take('batch')).frame.seq, 50, 'seq continues unchanged');
  }),
  testCase('resume.unknown-session', '7', 'HELLO with an unknown resume session is a new session (resumed 0)', async (c) => {
    const [, w] = await join(c, c.env.sim, 0x7ffffff1);
    eq(w.frame.resumed, 0, 'resumed');
  }),
  testCase('resume.after-grace', '7', 'after the grace the peer gets PEER_STATUS 2 (gone) and a late HELLO does not resume', async (c, hooks) => {
    if (hooks.advanceTime === undefined) return skip('needs hooks.advanceTime');
    const [a, b, , , [sidA]] = await matched(c);
    await a.client.close();
    await b.take('peerStatus', (f) => f.event === PeerStatusEvent.disconnected);
    await hooks.advanceTime(10_001);
    await b.take('peerStatus', (f) => f.event === PeerStatusEvent.gone);
    const [, w] = await join(c, c.env.sim, sidA, a);
    eq(w.frame.resumed, 0, 'resumed');
  }),
];

const resting: ConformanceCase[] = [
  testCase('resting.hello', '5', 'while resting, HELLO gets no ERROR frame and no WELCOME; the socket is closed (advisory 4011)', async (c, hooks) => {
    if (hooks.setResting === undefined) return skip('needs hooks.setResting');
    await hooks.setResting(120);
    const p = await connect(c);
    await p.send({ t: 'hello', ver: PROTOCOL_VERSION, simVersion: c.env.sim, resumeSession: 0 });
    await p.closed();
    await p.none();
  }),
  testCase('resting.resume-refused', '6', 'while resting, a HELLO with a resume session is closed without a frame too', async (c, hooks) => {
    if (hooks.setResting === undefined) return skip('needs hooks.setResting');
    await hooks.setResting(0);
    const p = await connect(c);
    await p.send({ t: 'hello', ver: PROTOCOL_VERSION, simVersion: c.env.sim, resumeSession: 5 });
    await p.closed();
    await p.none();
  }),
  testCase('resting.flip-while-connected', '5', 'a connected client is told with an ERROR 0x000B frame when the switch flips', async (c, hooks) => {
    if (hooks.setResting === undefined) return skip('needs hooks.setResting');
    const [p] = await join(c);
    await hooks.setResting(60);
    await p.send({ t: 'ping', nonce: 1 }); // a relay that pushes the frame by itself passes too
    eq((await p.take('error', (e) => e.code === ErrorCode.resting)).frame.retryAfterSec, 60, 'retryAfterSec');
  }),
  testCase('resting.match-finishes-or-60s', '5', 'a running match is not cut at once; it closes with 4011 after 60 s', async (c, hooks) => {
    if (hooks.setResting === undefined || hooks.advanceTime === undefined) return skip('needs hooks.setResting and hooks.advanceTime');
    const [a] = await matched(c);
    await hooks.setResting(60);
    await a.send({ t: 'ping', nonce: 1 });
    await a.take('error', (e) => e.code === ErrorCode.resting);
    await a.open();
    await hooks.advanceTime(60_001);
    await a.send({ t: 'ping', nonce: 2 });
    eq(await a.closed(), 4011, 'close code');
  }),
];

/** Every case, in run order. Cases share the relay but each uses its own connections and leaves nothing queued. */
export const conformanceCases: readonly ConformanceCase[] = [
  ...wire, ...wireText, ...hello, ...frames, ...queue, ...rooms, ...match, ...resume, ...resting,
];
