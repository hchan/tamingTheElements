import type { Command } from '../sim/commands';

/** Maximum inputs carried per packet; older unacked inputs beyond this wait for the next ack. */
export const MAX_INPUTS_PER_PACKET = 64;
/** Maximum hash checkpoints carried per packet. */
export const MAX_HASHES_PER_PACKET = 4;

export const PacketFlag = {
  /** Sender's tab is hidden / it has paused the match. */
  paused: 1,
  /** Sender concedes the match. */
  forfeit: 2,
} as const;

export interface HashEntry {
  readonly tick: number;
  readonly hash: number;
}

/**
 * One datagram. `ack` is the number of the receiver's inputs the sender holds contiguously from
 * tick 0 (the next tick it still needs). `inputs[i]` is the sender's command for tick `firstTick + i`.
 */
export interface Packet {
  /** Which match of a connection this belongs to (0..255): a rematch on the same link bumps it, so late packets of the old match are dropped. */
  readonly match: number;
  readonly flags: number;
  readonly ack: number;
  readonly firstTick: number;
  readonly inputs: readonly Command[];
  readonly hashes: readonly HashEntry[];
}

/** Wire size: 1 match, 1 flags, 4 ack, 4 firstTick, 1 nInputs, 2*n inputs, 1 nHashes, 8*m hashes. */
export function encodePacket(p: Packet): Uint8Array {
  const n = Math.min(p.inputs.length, MAX_INPUTS_PER_PACKET);
  const m = Math.min(p.hashes.length, MAX_HASHES_PER_PACKET);
  const buf = new Uint8Array(12 + 2 * n + 8 * m);
  const dv = new DataView(buf.buffer);
  let o = 0;
  dv.setUint8(o++, p.match);
  dv.setUint8(o++, p.flags);
  dv.setUint32(o, p.ack);
  o += 4;
  dv.setUint32(o, p.firstTick);
  o += 4;
  dv.setUint8(o++, n);
  for (let i = 0; i < n; i++, o += 2) dv.setUint16(o, p.inputs[i] as number);
  dv.setUint8(o++, m);
  for (let i = 0; i < m; i++, o += 8) {
    const h = p.hashes[i] as HashEntry;
    dv.setUint32(o, h.tick);
    dv.setUint32(o + 4, h.hash);
  }
  return buf;
}

/** Returns undefined for malformed input; a remote peer is untrusted, so decoding never throws. */
export function decodePacket(buf: Uint8Array): Packet | undefined {
  if (buf.length < 12) return undefined;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const match = dv.getUint8(o++);
  const flags = dv.getUint8(o++);
  const ack = dv.getUint32(o);
  o += 4;
  const firstTick = dv.getUint32(o);
  o += 4;
  const n = dv.getUint8(o++);
  if (n > MAX_INPUTS_PER_PACKET || buf.length < o + 2 * n + 1) return undefined;
  const inputs: Command[] = [];
  for (let i = 0; i < n; i++, o += 2) inputs.push(dv.getUint16(o));
  const m = dv.getUint8(o++);
  if (m > MAX_HASHES_PER_PACKET || buf.length !== o + 8 * m) return undefined;
  const hashes: HashEntry[] = [];
  for (let i = 0; i < m; i++, o += 8) hashes.push({ tick: dv.getUint32(o), hash: dv.getUint32(o + 4) });
  return { match, flags, ack, firstTick, inputs, hashes };
}
