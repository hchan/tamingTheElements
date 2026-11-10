/**
 * Minimal packet pipe the lockstep session talks to. Semantics match a WebRTC data channel
 * configured `{ negotiated: true, id: 0, ordered: false, maxRetransmits: 0 }`: packets are small,
 * may be lost, duplicated, delayed and reordered. The session never assumes more.
 */
export interface Transport {
  /** Fire and forget. Must not throw on a closed or lossy link. */
  send(packet: Uint8Array): void;
  /** Next packet that has arrived, or undefined when none is pending. */
  receive(): Uint8Array | undefined;
}
