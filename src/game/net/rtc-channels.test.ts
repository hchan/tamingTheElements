import { describe, expect, it } from 'vitest';
import { MAX_INBOX, controlPipe, inputTransport, type ChannelLike } from './rtc-channels';

function fake(state = 'open'): ChannelLike & { sent: unknown[]; emit(data: unknown): void; throwOnSend: boolean } {
  let handler: (ev: { data: unknown }) => void = () => undefined;
  const ch = {
    binaryType: 'blob',
    readyState: state,
    sent: [] as unknown[],
    throwOnSend: false,
    send(d: unknown) {
      if (ch.throwOnSend) throw new Error('closed');
      ch.sent.push(d);
    },
    addEventListener(_t: 'message', l: (ev: { data: unknown }) => void) {
      handler = l;
    },
    emit(data: unknown) {
      handler({ data });
    },
  };
  return ch;
}

describe('rtc channel adapters', () => {
  it('asks for ArrayBuffers and delivers messages in order as bytes', () => {
    const ch = fake();
    const t = inputTransport(ch);
    expect(ch.binaryType).toBe('arraybuffer');
    ch.emit(Uint8Array.of(1, 2).buffer);
    ch.emit(Uint8Array.of(3).buffer);
    expect(t.receive()).toEqual(Uint8Array.of(1, 2));
    expect(t.receive()).toEqual(Uint8Array.of(3));
    expect(t.receive()).toBeUndefined();
  });

  it('drops strings and other non-binary data from the peer', () => {
    const ch = fake();
    const t = controlPipe(ch);
    ch.emit('hello');
    ch.emit({ length: 1 });
    expect(t.receive()).toBeUndefined();
  });

  it('send never throws, on a closed channel or when the browser throws', () => {
    const closed = fake('closed');
    inputTransport(closed).send(Uint8Array.of(1));
    expect(closed.sent).toEqual([]);
    const flaky = fake();
    flaky.throwOnSend = true;
    expect(() => { controlPipe(flaky).send(Uint8Array.of(1)); }).not.toThrow();
    const ok = fake();
    controlPipe(ok).send(Uint8Array.of(9));
    expect(ok.sent).toHaveLength(1);
  });

  it('caps the inbox: the input channel keeps the newest, the control channel keeps the oldest', () => {
    const a = fake();
    const input = inputTransport(a);
    const b = fake();
    const control = controlPipe(b);
    for (let i = 0; i < MAX_INBOX + 5; i++) {
      a.emit(Uint8Array.of(i & 255).buffer);
      b.emit(Uint8Array.of(i & 255).buffer);
    }
    expect(input.receive()?.[0]).toBe(5);
    expect(control.receive()?.[0]).toBe(0);
  });
});
