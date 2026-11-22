import { describe, expect, it } from 'vitest';
import { encodeText } from '../../game/net/ws/text-codec';
import { encodeFrame } from '../../game/net/ws/wire';
import type { OnlineClient, OnlineEvent } from '../../game/net/ws/online-client';
import { WebSocketTransport } from '../../game/net/ws/transport';
import { Harness, matchStart, TestWs } from './fake-online-service';

/** Today's behaviour around a CHAT (0x70) frame, before chat-3 (docs/ONLINE-PROTOCOL.md section 4a); the chat-3 tests below it replace the first one. */
const chatFrame = (match: number, seq: number, text: string): Uint8Array => {
  const t = new TextEncoder().encode(text);
  return Uint8Array.of(0x70, match, seq, t.length, ...t);
};

async function inMatch(h: Harness): Promise<{ c: OnlineClient; events: OnlineEvent[]; ws: TestWs; t: WebSocketTransport }> {
  const { c, events } = h.client();
  const [r] = await Promise.all([c.connect(), h.flush()]);
  if (!r.ok) throw new Error('connect');
  const ws = h.svc.sockets[0] as TestWs;
  ws.serve(matchStart(0, 7));
  return { c, events, ws, t: r.value };
}

describe('characterization: CHAT frames on the pre-chat client', () => {
  it('a 0x70 frame handed to the match transport is counted malformed and the match goes on', () => {
    const listeners: ((ev: { data: unknown }) => void)[] = [];
    const t = new WebSocketTransport({ readyState: 1, send: () => undefined, addEventListener: (type, l) => { if (type === 'message') listeners.push(l); } }, () => 0);
    for (const l of listeners) l({ data: encodeText(chatFrame(7, 0, 'hi')) });
    expect(t.malformed).toBe(1);
    expect(t.closed).toBe(false);
    for (const l of listeners) l({ data: encodeText(encodeFrame({ t: 'pong', nonce: 1 })) });
    expect(t.malformed).toBe(1);
  });

  it('a WELCOME with caps set connects like caps 0 (bytes 7-8 were ignored)', async () => {
    const h = new Harness();
    h.svc.caps = 1;
    const { c } = h.client();
    const [r] = await Promise.all([c.connect(), h.flush()]);
    expect(r.ok).toBe(true);
    expect(encodeText(chatFrame(7, 0, 'x'))).toBe('cAcAAXg=');
  });
});

const errChat = (seq: number, code = 9, retry = 1): Uint8Array => encodeFrame({ t: 'error', code, retryAfterSec: retry, detail: 0x7000 | seq });

describe('OnlineClient chat (chat-3)', () => {
  it('caps come from WELCOME byte 7 bit 0', async () => {
    for (const [caps, want] of [[0, false], [1, true], [2, false], [3, true]] as const) {
      const h = new Harness();
      h.svc.caps = caps;
      const { c } = h.client();
      await Promise.all([c.connect(), h.flush()]);
      expect(c.chatSupported()).toBe(want);
    }
  });

  it('a 0x70 frame reaches onChat only, not the transport, events or lastError', async () => {
    const h = new Harness();
    h.svc.caps = 1;
    const { c, events, ws, t } = await inMatch(h);
    const got: { seq: number; text: string }[] = [];
    c.onChat = (m) => { got.push(m); };
    ws.serve(chatFrame(7, 3, 'hi \u{1F600}'));
    expect(got).toEqual([{ seq: 3, text: 'hi \u{1F600}' }]);
    expect(t.malformed).toBe(0);
    expect(events.filter((e) => e.t === 'error')).toEqual([]);
    expect(t.lastError).toBeUndefined();
  });

  it('drops a 0x70 frame for another match, bad text or a bad length (no throw, not malformed)', async () => {
    const h = new Harness();
    h.svc.caps = 1;
    const { c, ws, t } = await inMatch(h);
    const got: unknown[] = [];
    c.onChat = (m) => { got.push(m); };
    ws.serve(chatFrame(8, 0, 'other'));
    ws.serve(Uint8Array.of(0x70, 7, 0, 1, 0xff));
    ws.serve(Uint8Array.of(0x70, 7, 0, 2, 0x61));
    ws.serve(Uint8Array.of(0x70, 7));
    ws.serve(Uint8Array.of(0x70, 7, 0, 0));
    ws.serve(chatFrame(7, 0, 'a\nb'));
    expect(got).toEqual([]);
    expect(t.malformed).toBe(0);
    for (let i = 0; i < 300; i++) ws.serve(Uint8Array.from({ length: i % 130 }, (_, k) => (k === 0 ? 0x70 : (i * 31 + k * 7) & 0xff)));
    expect(t.closed).toBe(false);
  });

  it('a tagged ERROR goes to onChatError and nowhere else: no event, no lastError, the socket stays', async () => {
    const h = new Harness();
    h.svc.caps = 1;
    const { c, events, ws, t } = await inMatch(h);
    const errs: unknown[] = [];
    c.onChatError = (e) => { errs.push(e); };
    const before = events.length;
    ws.serve(errChat(5, 9, 1));
    ws.serve(errChat(6, 0x0e, 0));
    expect(errs).toEqual([{ seq: 5, code: 9, retryAfterSec: 1 }, { seq: 6, code: 0x0e, retryAfterSec: 0 }]);
    expect(events.length).toBe(before);
    expect(t.lastError).toBeUndefined();
    expect(t.closed).toBe(false);
    expect(ws.readyState).toBe(1);
    ws.drop(1006); // a later close is not blamed on the chat error: it reconnects, not "server error"
    await h.flush();
    expect(events.some((e) => e.t === 'reconnecting')).toBe(true);
  });

  it('an untagged ERROR still behaves as before', async () => {
    const h = new Harness();
    h.svc.caps = 1;
    const { c, events, ws } = await inMatch(h);
    c.onChatError = () => { throw new Error('not chat'); };
    ws.serve(encodeFrame({ t: 'error', code: 5, retryAfterSec: 0, detail: 3 }));
    expect(events.at(-1)).toMatchObject({ t: 'error' });
  });

  it('sendChat sends a 0x70 frame with matchId and a counting chatSeq that wraps at 256, outside the transport seq', async () => {
    const h = new Harness();
    h.svc.caps = 1;
    const { c, ws } = await inMatch(h);
    expect(c.sendChat('hi')).toBe(0);
    expect(c.sendChat('yo')).toBe(1);
    const sent = ws.sent.filter((m) => m[0] === 0x70);
    expect(sent).toEqual([Uint8Array.of(0x70, 7, 0, 2, 0x68, 0x69), Uint8Array.of(0x70, 7, 1, 2, 0x79, 0x6f)]);
    for (let i = 2; i < 256; i++) expect(c.sendChat('x')).toBe(i);
    expect(c.sendChat('x')).toBe(0);
    expect(ws.sent.filter((m) => m[0] === 0x40)).toEqual([]);
  });

  it('sendChat refuses bad text, over 120 bytes, no caps, no match, a closed socket, and after leaving the match', async () => {
    const h = new Harness();
    h.svc.caps = 1;
    const { c, ws } = await inMatch(h);
    expect(c.sendChat('')).toBeUndefined();
    expect(c.sendChat('   ')).toBeUndefined();
    expect(c.sendChat('a\nb')).toBeUndefined();
    expect(c.sendChat('a'.repeat(121))).toBeUndefined();
    expect(c.sendChat('a'.repeat(120))).toBe(0);
    expect(c.sendChat('\u00e9'.repeat(61))).toBeUndefined(); // 122 bytes
    expect(ws.sent.filter((m) => m[0] === 0x70).length).toBe(1);
    expect(c.joinQueue()).toBe(true); // leaving the match drops chat
    expect(c.sendChat('late')).toBeUndefined();
    ws.drop(1006);
    expect(c.sendChat('closed')).toBeUndefined();

    const h2 = new Harness(); // chat off on this relay
    const a = await inMatch(h2);
    expect(a.c.sendChat('hi')).toBeUndefined();
    const h3 = new Harness(); // chat on, but not in a match
    h3.svc.caps = 1;
    const x = h3.client();
    await Promise.all([x.c.connect(), h3.flush()]);
    expect(x.c.sendChat('hi')).toBeUndefined();
  });

  it('chat stays open on the result screen (after RESULT) and a new match restarts chatSeq', async () => {
    const h = new Harness();
    h.svc.caps = 1;
    const { c, ws } = await inMatch(h);
    expect(c.sendChat('a')).toBe(0);
    ws.serve(Uint8Array.of(0x51, 7, 0)); // RESULT acknowledged: the result screen
    expect(c.sendChat('gg')).toBe(1);
    ws.serve(matchStart(1, 8));
    expect(c.sendChat('again')).toBe(0);
    expect(ws.sent.filter((m) => m[0] === 0x70).at(-1)?.[1]).toBe(8);
  });

  it('a resumed match keeps chatSeq', async () => {
    const h = new Harness();
    h.svc.caps = 1;
    h.svc.matchNo = 7;
    const { c, ws } = await inMatch(h);
    expect(c.sendChat('a')).toBe(0);
    ws.drop(1006);
    await h.step(5000);
    expect(c.sendChat('b')).toBe(1);
  });
});
