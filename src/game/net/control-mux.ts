import type { ControlPipe } from '@core/index';

/** Control-channel message type bytes after the setup handshake (HELLO/READY/REJECT use 1-3, the pick message 10; 21 and 22 are ping/pong). */
export const MSG_BYE = 20;
export const MSG_PING = 21;
export const MSG_PONG = 22;
/** Round-trip samples kept for the readout (it shows their mean) and pings allowed in flight at once. */
const RTT_SAMPLES = 8;
const MAX_PENDING = 8;

/**
 * Sits between the screen and the reliable control channel. Nobody reads the channel during a match, so a friend's BYE ("I left")
 * would sit unread; `pump()` (called on a short timer by the screen) drains it, handles BYE at once and queues every other
 * message for the setup handshake and the pick exchange, which read through `pipe` exactly as they read the raw channel before.
 */
export class ControlMux {
  /** The channel as the setup handshake and the pick exchange see it: everything except the mux's own messages. */
  readonly pipe: ControlPipe;
  private readonly queue: Uint8Array[] = [];
  private bye = false;
  private sentBye = false;
  private pingId = 0;
  private readonly pending = new Map<number, number>();
  private readonly samples: number[] = [];

  constructor(
    private readonly raw: ControlPipe,
    private readonly onBye: () => void,
    /** Wall clock in ms (outside core, so a clock is fine); a test passes its own. */
    private readonly now: () => number = () => performance.now(),
  ) {
    this.pipe = {
      send: (m) => { this.raw.send(m); },
      receive: () => {
        this.pump();
        return this.queue.shift();
      },
    };
  }

  /** True once the friend said BYE. */
  get friendLeft(): boolean {
    return this.bye;
  }

  /** Drain the channel: BYE is handled (once), everything else is queued in order. */
  pump(): void {
    for (let m = this.raw.receive(); m !== undefined; m = this.raw.receive()) {
      if (m[0] === MSG_PING) {
        // Echo at once (the peer measures); a short or junk ping is dropped, never an error.
        if (m.length === 5 && !this.bye) this.raw.send(Uint8Array.of(MSG_PONG, m[1] as number, m[2] as number, m[3] as number, m[4] as number));
      } else if (m[0] === MSG_PONG) {
        this.onPong(m);
      } else if (m[0] === MSG_BYE) {
        if (!this.bye) {
          this.bye = true;
          this.queue.length = 0;
          this.onBye();
        }
      } else if (!this.bye) this.queue.push(m);
    }
  }

  /** Smoothed round-trip time in ms (mean of the last few pongs), or undefined before the first answer. */
  get rttMs(): number | undefined {
    if (this.samples.length === 0) return undefined;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  /** Send a ping (the screen calls this about once a second); the pong's arrival gives one round-trip sample. */
  sendPing(): void {
    if (this.sentBye || this.bye) return;
    const id = this.pingId++ >>> 0;
    if (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value as number);
    this.pending.set(id, this.now());
    this.raw.send(Uint8Array.of(MSG_PING, id >>> 24, (id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff));
  }

  private onPong(m: Uint8Array): void {
    if (m.length !== 5) return;
    const id = (((m[1] as number) << 24) | ((m[2] as number) << 16) | ((m[3] as number) << 8) | (m[4] as number)) >>> 0;
    const sent = this.pending.get(id);
    if (sent === undefined) return;
    this.pending.delete(id);
    this.samples.push(Math.max(0, this.now() - sent));
    if (this.samples.length > RTT_SAMPLES) this.samples.shift();
  }

  /** Tell the friend we left (sent at most once). */
  sendBye(): void {
    if (this.sentBye) return;
    this.sentBye = true;
    this.raw.send(Uint8Array.of(MSG_BYE));
  }
}
