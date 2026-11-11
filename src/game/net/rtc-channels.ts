import type { ControlPipe } from '@core/index';
import type { Transport } from '@core/index';

/** The slice of RTCDataChannel the adapters use (so tests can fake it, and nothing else of the DOM type leaks in). */
export interface ChannelLike {
  binaryType: string;
  readyState: string;
  send(data: ArrayBuffer | ArrayBufferView): void;
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
}

/** Cap on queued inbound messages, so a flooding peer cannot grow memory without bound. */
export const MAX_INBOX = 256;

/**
 * Inbox of received binary messages. Anything that is not an ArrayBuffer (strings, blobs) is dropped: the peer is untrusted.
 * Oldest messages go first when the cap is hit, which suits the input channel (stale inputs are useless).
 */
class Inbox {
  private readonly queue: Uint8Array[] = [];

  constructor(
    private readonly channel: ChannelLike,
    private readonly dropOldest: boolean,
  ) {
    channel.binaryType = 'arraybuffer';
    channel.addEventListener('message', (ev) => {
      if (!(ev.data instanceof ArrayBuffer)) return;
      if (this.queue.length >= MAX_INBOX) {
        if (!this.dropOldest) return;
        this.queue.shift();
      }
      this.queue.push(new Uint8Array(ev.data));
    });
  }

  next(): Uint8Array | undefined {
    return this.queue.shift();
  }

  /** Never throws: a closed or closing channel just loses the message (the session's timeout handles a dead peer). */
  send(bytes: Uint8Array): void {
    if (this.channel.readyState !== 'open') return;
    try {
      this.channel.send(bytes);
    } catch {
      // Closed between the check and the send.
    }
  }
}

/** Unreliable input channel: create it with `{ negotiated: true, id: 0, ordered: false, maxRetransmits: 0 }`. */
export function inputTransport(channel: ChannelLike): Transport {
  const box = new Inbox(channel, true);
  return { send: (p) => { box.send(p); }, receive: () => box.next() };
}

/** Reliable ordered control channel: create it with `{ negotiated: true, id: 1 }`. A full inbox drops NEW messages (order matters). */
export function controlPipe(channel: ChannelLike): ControlPipe {
  const box = new Inbox(channel, false);
  return { send: (m) => { box.send(m); }, receive: () => box.next() };
}
