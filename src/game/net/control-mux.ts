import type { ControlPipe } from '@core/index';

/** Control-channel message type bytes after the setup handshake (HELLO/READY/REJECT use 1-3, the pick message 10; 21 and 22 are reserved for ping/pong). */
export const MSG_BYE = 20;

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

  constructor(
    private readonly raw: ControlPipe,
    private readonly onBye: () => void,
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
      if (m[0] === MSG_BYE) {
        if (!this.bye) {
          this.bye = true;
          this.queue.length = 0;
          this.onBye();
        }
      } else if (!this.bye) this.queue.push(m);
    }
  }

  /** Tell the friend we left (sent at most once). */
  sendBye(): void {
    if (this.sentBye) return;
    this.sentBye = true;
    this.raw.send(Uint8Array.of(MSG_BYE));
  }
}
