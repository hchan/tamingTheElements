import { decodeFrame, type Frame } from './codec';
import type { Sender } from './store';

export interface SentFrame {
  readonly conn: string;
  readonly data: Uint8Array;
}

/**
 * Test sender: records every send and close, and hands frames to per-connection listeners. By default delivery is immediate;
 * `hold()` queues frames instead so a test can `release` them reordered or duplicated (what a serverless backend may do).
 */
export class LoopbackSender implements Sender {
  readonly sent: SentFrame[] = [];
  readonly closed: { conn: string; code: number }[] = [];
  private readonly listeners = new Map<string, (data: Uint8Array) => void>();
  private queue: SentFrame[] | undefined;

  send(conn: string, data: Uint8Array): void {
    const f = { conn, data: data.slice() };
    this.sent.push(f);
    if (this.queue !== undefined) this.queue.push(f);
    else this.listeners.get(conn)?.(f.data);
  }

  close(conn: string, code: number): void {
    this.closed.push({ conn, code });
  }

  /** Receives every frame sent to `conn` from now on. */
  listen(conn: string, cb: (data: Uint8Array) => void): void {
    this.listeners.set(conn, cb);
  }

  /** Starts holding frames (not delivering). */
  hold(): void {
    this.queue ??= [];
  }

  /** Delivers the held frames in the order `order` returns (default: as sent) and stops holding. */
  release(order: (frames: SentFrame[]) => SentFrame[] = (f) => f): void {
    const q = order(this.queue ?? []);
    this.queue = undefined;
    for (const f of q) this.listeners.get(f.conn)?.(f.data.slice());
  }

  /** Decoded frames sent to `conn` (server-to-client direction). Undecodable frames are skipped. */
  framesFor(conn: string): Frame[] {
    const out: Frame[] = [];
    for (const f of this.sent) {
      if (f.conn !== conn) continue;
      const d = decodeFrame(f.data, 's2c');
      if (d.ok) out.push(d.frame);
    }
    return out;
  }

  clear(): void {
    this.sent.length = 0;
    this.closed.length = 0;
  }
}
