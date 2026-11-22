import { describe, expect, it } from 'vitest';
import { ChatChannel } from './chat-channel';
import { rot13 } from './chat-filter';
import { CHAT_CLIENT_BURST, CHAT_MAX_PER_SENDER } from './chat-rules';

class FakeClient {
  sent: string[] = [];
  next = 0;
  open = true;
  sendChat(text: string): number | undefined {
    if (!this.open) return undefined;
    this.sent.push(text);
    return this.next++;
  }
}

function make() {
  const client = new FakeClient();
  let now = 10_000;
  const ch = new ChatChannel(client, () => now);
  return { client, ch, advance: (ms: number) => { now += ms; } };
}

describe('ChatChannel send', () => {
  it('echoes an own line at once with the chatSeq the client used', () => {
    const { ch, client } = make();
    expect(ch.send('  hi\tthere ')).toEqual({ kind: 'sent', seq: 0 });
    expect(client.sent).toEqual(['hi there']);
    expect(ch.lines()).toMatchObject([{ own: true, seq: 0, text: 'hi there', failure: undefined }]);
  });

  it('refuses empty, over-long and unavailable without sending', () => {
    const { ch, client } = make();
    expect(ch.send(' \n ')).toEqual({ kind: 'empty' });
    expect(ch.send('x'.repeat(121))).toEqual({ kind: 'tooLong' });
    client.open = false;
    expect(ch.send('hi')).toEqual({ kind: 'unavailable' });
    expect(client.sent).toEqual([]);
    expect(ch.lines()).toEqual([]);
  });

  it('counts bytes, not characters, for the length limit', () => {
    expect(make().ch.send('é'.repeat(60)).kind).toBe('sent');
    expect(make().ch.send('é'.repeat(61)).kind).toBe('tooLong');
  });

  it('client burst: the third quick line says Wait and a token comes back after a second', () => {
    const { ch, client, advance } = make();
    for (let i = 0; i < CHAT_CLIENT_BURST; i++) expect(ch.send('a' + i).kind).toBe('sent');
    expect(ch.send('late')).toEqual({ kind: 'wait', seconds: 1 });
    expect(client.sent).toHaveLength(CHAT_CLIENT_BURST);
    expect(ch.lines()).toHaveLength(CHAT_CLIENT_BURST);
    advance(500);
    expect(ch.send('late')).toEqual({ kind: 'wait', seconds: 1 });
    advance(500);
    expect(ch.send('late').kind).toBe('sent');
  });

  it('tokens never exceed the burst however long the idle time', () => {
    const { ch, advance } = make();
    advance(60_000);
    expect(ch.send('a').kind).toBe('sent');
    expect(ch.send('b').kind).toBe('sent');
    expect(ch.send('c').kind).toBe('wait');
  });

  it('stops at the per-match limit and keeps the log at 100 lines', () => {
    const { ch, advance } = make();
    for (let i = 0; i < CHAT_MAX_PER_SENDER; i++) {
      advance(1000);
      expect(ch.send('m' + i).kind).toBe('sent');
    }
    advance(5000);
    expect(ch.send('one more')).toEqual({ kind: 'limit' });
    expect(ch.limitReached()).toBe(true);
    expect(ch.lines()).toHaveLength(100);
  });

  it('drops the oldest line when the log passes 100', () => {
    const { ch } = make();
    for (let i = 0; i < 100; i++) ch.receive({ seq: i, text: 'p' + i });
    ch.send('mine');
    const l = ch.lines();
    expect(l).toHaveLength(100);
    expect(l[0]?.text).toBe('p1');
    expect(l[99]?.text).toBe('mine');
  });
});

describe('ChatChannel refused lines', () => {
  it('a tagged error marks exactly that line and offers the text back for too-fast', () => {
    const { ch } = make();
    ch.send('first');
    ch.send('second');
    expect(ch.refuse({ seq: 1, code: 9, retryAfterSec: 1 })).toEqual({ reason: 'tooFast', text: 'second', retryAfterSec: 1 });
    const l = ch.lines();
    expect(l[0]?.failure).toBeUndefined();
    expect(l[1]?.failure).toBe('tooFast');
  });

  it('maps away, limit and bad text; limit disables sending', () => {
    const { ch, advance } = make();
    ch.send('a');
    advance(1000);
    ch.send('b');
    advance(1000);
    ch.send('c');
    expect(ch.refuse({ seq: 0, code: 0x0e, retryAfterSec: 0 })?.reason).toBe('away');
    expect(ch.refuse({ seq: 1, code: 1, retryAfterSec: 0 })?.reason).toBe('rejected');
    expect(ch.refuse({ seq: 2, code: 0x0d, retryAfterSec: 0 })?.reason).toBe('limit');
    expect(ch.limitReached()).toBe(true);
    advance(5000);
    expect(ch.send('d')).toEqual({ kind: 'limit' });
  });

  it('ignores an unknown seq and a repeated error, and never marks a peer line', () => {
    const { ch } = make();
    ch.send('a');
    ch.receive({ seq: 0, text: 'peer' });
    expect(ch.refuse({ seq: 7, code: 9, retryAfterSec: 1 })).toBeUndefined();
    expect(ch.refuse({ seq: 0, code: 0x0e, retryAfterSec: 0 })?.reason).toBe('away');
    expect(ch.refuse({ seq: 0, code: 0x0e, retryAfterSec: 0 })).toBeUndefined();
    expect(ch.lines().find((x) => !x.own)?.failure).toBeUndefined();
  });
});

describe('ChatChannel receive', () => {
  it('drops repeats and seq at or past the per-match limit', () => {
    const { ch } = make();
    expect(ch.receive({ seq: 0, text: 'a' })).toBe(true);
    expect(ch.receive({ seq: 0, text: 'a' })).toBe(false);
    expect(ch.receive({ seq: CHAT_MAX_PER_SENDER, text: 'x' })).toBe(false);
    expect(ch.receive({ seq: 255, text: 'x' })).toBe(false);
    expect(ch.lines()).toHaveLength(1);
  });

  it('drops invalid text and strips bidi controls', () => {
    const { ch } = make();
    expect(ch.receive({ seq: 0, text: '   ' })).toBe(false);
    expect(ch.receive({ seq: 1, text: 'a\u0007b' })).toBe(false);
    expect(ch.receive({ seq: 2, text: 'a‮b' })).toBe(true);
    expect(ch.lines()[0]?.text).toBe('ab');
  });

  it('puts a late lower seq before the first later peer line', () => {
    const { ch } = make();
    ch.receive({ seq: 0, text: 'p0' });
    ch.receive({ seq: 2, text: 'p2' });
    ch.receive({ seq: 1, text: 'p1' });
    expect(ch.lines().map((x) => x.text)).toEqual(['p0', 'p1', 'p2']);
  });

  it('scans back at most 8 lines', () => {
    const { ch } = make();
    ch.receive({ seq: 5, text: 'p5' });
    for (let i = 0; i < 9; i++) ch.receive({ seq: 10 + i, text: 'q' + i });
    ch.receive({ seq: 1, text: 'late' });
    const t = ch.lines().map((x) => x.text);
    expect(t).toHaveLength(11);
    expect(t.indexOf('late')).toBe(2);
    expect(t[0]).toBe('p5');
  });

  it('own lines never move a peer line', () => {
    const { ch } = make();
    ch.receive({ seq: 3, text: 'p3' });
    ch.send('mine');
    ch.receive({ seq: 1, text: 'p1' });
    expect(ch.lines().map((x) => x.text)).toEqual(['p1', 'p3', 'mine']);
  });
});

describe('ChatChannel mute, filter, reset', () => {
  it('muted lines are dropped for good and not counted', () => {
    const { ch } = make();
    ch.setMuted(true);
    expect(ch.receive({ seq: 0, text: 'hi' })).toBe(false);
    ch.setMuted(false);
    expect(ch.lines()).toEqual([]);
    expect(ch.receive({ seq: 0, text: 'hi' })).toBe(false); // seen while muted: never revealed
    expect(ch.receive({ seq: 1, text: 'hi' })).toBe(true);
  });

  it('the filter changes display only, never what is sent, and can be switched', () => {
    const { ch, client } = make();
    const rude = rot13('shpx');
    ch.send(`oh ${rude}`);
    ch.receive({ seq: 0, text: `${rude} you` });
    expect(client.sent).toEqual([`oh ${rude}`]);
    expect(ch.filterOn()).toBe(true);
    expect(ch.lines().map((x) => x.text)).toEqual(['oh ****', '**** you']);
    ch.setFilter(false);
    expect(ch.lines().map((x) => x.text)).toEqual([`oh ${rude}`, `${rude} you`]);
  });

  it('reset clears log, seen-set, counters, mute and the limit; the filter choice stays', () => {
    const { ch, advance } = make();
    ch.setFilter(false);
    ch.setMuted(true);
    ch.receive({ seq: 0, text: 'x' });
    ch.setMuted(false);
    ch.send('a');
    ch.refuse({ seq: 0, code: 0x0d, retryAfterSec: 0 });
    ch.reset();
    expect(ch.lines()).toEqual([]);
    expect(ch.muted()).toBe(false);
    expect(ch.limitReached()).toBe(false);
    expect(ch.filterOn()).toBe(false);
    advance(3000);
    expect(ch.receive({ seq: 0, text: 'x' })).toBe(true);
    expect(ch.send('b').kind).toBe('sent');
  });

  it('notifies listeners on every change and stops after unsubscribe', () => {
    const { ch } = make();
    let n = 0;
    const off = ch.onChange(() => { n++; });
    ch.send('a');
    ch.receive({ seq: 0, text: 'b' });
    ch.setMuted(true);
    expect(n).toBe(3);
    off();
    ch.setMuted(false);
    expect(n).toBe(3);
  });
});
