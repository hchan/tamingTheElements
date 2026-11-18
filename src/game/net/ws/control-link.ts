import type { ControlPipe } from '@core/index';

/** Resend the oldest unacknowledged control message this often [choice, spec section 6]. */
export const CTL_RESEND_MS = 200;
/** Unacknowledged messages kept; the handshake sends a handful, so more means a dead link (extra sends are dropped). */
export const CTL_MAX_UNACKED = 32;

/**
 * Reliable ordered control stream over unreliable frames (spec section 6, SETUP): numbers messages with a u8 `ctlSeq`,
 * resends the oldest unacked one every 200 ms, delivers in ctlSeq order only and drops duplicates. `ackCtl` is the highest
 * ctlSeq delivered (0xFF before any). An empty body is a pure ack. `tick(now)` must be called regularly.
 */
export class ControlLink implements ControlPipe {
  private nextOut = 0;
  private nextIn = 0;
  private unacked: { readonly ctlSeq: number; readonly body: Uint8Array }[] = [];
  private lastSend = 0;
  private readonly inbox: Uint8Array[] = [];

  constructor(
    private readonly emit: (ctlSeq: number, ackCtl: number, body: Uint8Array) => void,
    private readonly clock: () => number,
  ) {}

  private get ack(): number {
    return (this.nextIn - 1) & 0xff;
  }

  /** A new match on the same connection starts a fresh stream (spec section 7, reset rule). */
  reset(): void {
    this.nextOut = 0;
    this.nextIn = 0;
    this.unacked = [];
    this.lastSend = 0;
    this.inbox.length = 0;
  }

  send(message: Uint8Array): void {
    if (message.length === 0 || this.unacked.length >= CTL_MAX_UNACKED) return;
    const ctlSeq = this.nextOut++ & 0xff;
    this.unacked.push({ ctlSeq, body: message.slice() });
    this.emit(ctlSeq, this.ack, message);
    this.lastSend = this.clock();
  }

  receive(): Uint8Array | undefined {
    return this.inbox.shift();
  }

  /** Feed a decoded SETUP frame. */
  onFrame(ctlSeq: number, ackCtl: number, body: Uint8Array): void {
    const oldest = this.unacked[0];
    if (oldest) {
      const count = ((ackCtl - oldest.ctlSeq) & 0xff) + 1;
      if (count <= this.unacked.length) this.unacked.splice(0, count);
    }
    if (body.length === 0) return;
    if (ctlSeq === (this.nextIn & 0xff)) {
      this.nextIn++;
      this.inbox.push(body);
    }
    // Ack every message, also duplicates and out-of-order ones, so the sender stops resending.
    this.emit(this.nextOut & 0xff, this.ack, new Uint8Array(0));
  }

  /** Resends the oldest unacked message when it has waited long enough. */
  tick(now: number): void {
    const o = this.unacked[0];
    if (o && now - this.lastSend >= CTL_RESEND_MS) {
      this.emit(o.ctlSeq, this.ack, o.body);
      this.lastSend = now;
    }
  }
}
