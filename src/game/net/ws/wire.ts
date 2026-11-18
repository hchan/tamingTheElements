import { MAX_HASHES_PER_PACKET, MAX_INPUTS_PER_PACKET } from '@core/index';

/**
 * Frames of docs/ONLINE-PROTOCOL.md section 4 that the client transport needs (not the lobby/queue frames).
 * Big-endian, WebSocket binary messages. `decodeFrame` never throws: anything malformed or oversize is `undefined`.
 * Isolated on purpose, so the shared core codec can replace it later.
 */
export const FrameType = {
  setup: 0x31,
  batch: 0x40,
  hash: 0x41,
  desync: 0x42,
  pause: 0x43,
  result: 0x50,
  ping: 0x60,
  pong: 0x61,
  error: 0x7f,
} as const;

/** Largest SETUP control message body (spec: 5 + 2 + 2 + 401 bytes). */
export const MAX_SETUP_BODY = 401;
/** Largest BATCH: type, seq, then a 12 + 2n + 8m byte Packet. */
export const MAX_BATCH_BYTES = 1 + 4 + 12 + 4 * MAX_INPUTS_PER_PACKET + 8 * MAX_HASHES_PER_PACKET;

export type Frame =
  | { readonly t: 'setup'; readonly ctlSeq: number; readonly ackCtl: number; readonly body: Uint8Array }
  | { readonly t: 'batch'; readonly seq: number; readonly packet: Uint8Array }
  | { readonly t: 'hash'; readonly seq: number; readonly matchId: number; readonly tick: number; readonly hash: number }
  | { readonly t: 'desync'; readonly seq: number; readonly matchId: number; readonly tick: number; readonly localHash: number; readonly remoteHash: number }
  | { readonly t: 'pause'; readonly seq: number; readonly matchId: number; readonly flags: number }
  | { readonly t: 'result'; readonly seq: number; readonly matchId: number; readonly winner: number; readonly reason: number; readonly ticks: number; readonly finalHash: number }
  | { readonly t: 'ping'; readonly nonce: number }
  | { readonly t: 'pong'; readonly nonce: number }
  | { readonly t: 'error'; readonly code: number; readonly retryAfterSec: number; readonly detail: number };

type Width = 1 | 2 | 4;
type Layout = readonly (readonly [string, Width])[];

/** Fixed-layout frames: type byte, then fields in order. */
const FIXED: Readonly<Record<number, { readonly t: Frame['t']; readonly fields: Layout }>> = {
  [FrameType.hash]: { t: 'hash', fields: [['seq', 4], ['matchId', 1], ['tick', 4], ['hash', 4]] },
  [FrameType.desync]: { t: 'desync', fields: [['seq', 4], ['matchId', 1], ['tick', 4], ['localHash', 4], ['remoteHash', 4]] },
  [FrameType.pause]: { t: 'pause', fields: [['seq', 4], ['matchId', 1], ['flags', 1]] },
  [FrameType.result]: { t: 'result', fields: [['seq', 4], ['matchId', 1], ['winner', 1], ['reason', 1], ['ticks', 4], ['finalHash', 4]] },
  [FrameType.ping]: { t: 'ping', fields: [['nonce', 4]] },
  [FrameType.pong]: { t: 'pong', fields: [['nonce', 4]] },
  [FrameType.error]: { t: 'error', fields: [['code', 2], ['retryAfterSec', 2], ['detail', 2]] },
};

function put(dv: DataView, o: number, w: Width, v: number): void {
  if (w === 1) dv.setUint8(o, v);
  else if (w === 2) dv.setUint16(o, v);
  else dv.setUint32(o, v >>> 0);
}

function get(dv: DataView, o: number, w: Width): number {
  return w === 1 ? dv.getUint8(o) : w === 2 ? dv.getUint16(o) : dv.getUint32(o);
}

/** Encodes a frame; an oversize BATCH packet or SETUP body is truncated to the spec maximum (callers check sizes first). */
export function encodeFrame(f: Frame): Uint8Array {
  if (f.t === 'batch') {
    const p = f.packet.subarray(0, MAX_BATCH_BYTES - 5);
    const out = new Uint8Array(5 + p.length);
    out[0] = FrameType.batch;
    new DataView(out.buffer).setUint32(1, f.seq >>> 0);
    out.set(p, 5);
    return out;
  }
  if (f.t === 'setup') {
    const b = f.body.subarray(0, MAX_SETUP_BODY);
    const out = new Uint8Array(9 + b.length);
    const dv = new DataView(out.buffer);
    out[0] = FrameType.setup;
    // The spec lists a `seq u32` in SETUP but excludes SETUP from the seq counter: it is sent as 0 and ignored.
    dv.setUint8(5, f.ctlSeq);
    dv.setUint8(6, f.ackCtl);
    dv.setUint16(7, b.length);
    out.set(b, 9);
    return out;
  }
  const type = Number(Object.keys(FIXED).find((k) => FIXED[Number(k)]?.t === f.t));
  const spec = FIXED[type];
  const fields = spec?.fields ?? [];
  const out = new Uint8Array(1 + fields.reduce((n, [, w]) => n + w, 0));
  const dv = new DataView(out.buffer);
  out[0] = type;
  let o = 1;
  for (const [name, w] of fields) {
    put(dv, o, w, (f as unknown as Record<string, number>)[name] ?? 0);
    o += w;
  }
  return out;
}

function decodeBatch(b: Uint8Array): Frame | undefined {
  if (b.length < 5 + 12 || b.length > MAX_BATCH_BYTES) return undefined;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = dv.getUint8(5 + 10);
  if (n > MAX_INPUTS_PER_PACKET || b.length < 5 + 12 + 4 * n) return undefined;
  const m = dv.getUint8(5 + 11 + 4 * n);
  if (m > MAX_HASHES_PER_PACKET || b.length !== 5 + 12 + 4 * n + 8 * m) return undefined;
  return { t: 'batch', seq: dv.getUint32(1), packet: b.slice(5) };
}

function decodeSetup(b: Uint8Array): Frame | undefined {
  if (b.length < 9) return undefined;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = dv.getUint16(7);
  if (n > MAX_SETUP_BODY || b.length !== 9 + n) return undefined;
  return { t: 'setup', ctlSeq: b[5] as number, ackCtl: b[6] as number, body: b.slice(9) };
}

/** Decodes one binary message; `undefined` for an unknown type, a wrong length or an over-limit field. */
export function decodeFrame(b: Uint8Array): Frame | undefined {
  const type = b[0];
  if (type === FrameType.batch) return decodeBatch(b);
  if (type === FrameType.setup) return decodeSetup(b);
  const spec = type === undefined ? undefined : FIXED[type];
  if (!spec) return undefined;
  const size = 1 + spec.fields.reduce((n, [, w]) => n + w, 0);
  if (b.length !== size) return undefined;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Record<string, unknown> = { t: spec.t };
  let o = 1;
  for (const [name, w] of spec.fields) {
    out[name] = get(dv, o, w);
    o += w;
  }
  return out as unknown as Frame;
}
