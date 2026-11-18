import {
  ErrorCode,
  FrameType,
  MAX_BATCH_FRAME,
  MAX_HASHES_PER_BATCH,
  MAX_INPUTS_PER_BATCH,
  MAX_SETUP_BYTES,
  MAX_SETUP_FRAME,
} from './constants';
import { CODE_LENGTH } from './rooms-rules';

/** Decoded fields per frame (docs/ONLINE-PROTOCOL.md section 4). Integers are big-endian on the wire. */
export interface FrameFields {
  hello: { ver: number; simVersion: number; resumeSession: number };
  welcome: { ver: number; sessionId: number; resumed: number; serverHint: number };
  queueJoin: { mode: number };
  queueLeave: object;
  queueState: { waitingSec: number };
  roomCreate: object;
  roomCreated: { code: string; ttlSec: number };
  roomJoin: { code: string };
  roomPeer: { event: number };
  matchStart: {
    matchId: number;
    slot: number;
    seed: number;
    inputDelay: number;
    simVersion: number;
    batchEvery: number;
  };
  /** `seq` is carried but not counted (SETUP has its own ctlSeq/ackCtl stream); `blob` = one control message. */
  setup: { seq: number; ctlSeq: number; ackCtl: number; blob: Uint8Array };
  /** `packet` is the exact `encodePacket` bytes; `match` is its first byte. */
  batch: { seq: number; match: number; packet: Uint8Array };
  hash: { seq: number; matchId: number; tick: number; hash: number };
  desync: { seq: number; matchId: number; tick: number; localHash: number; remoteHash: number };
  pause: { seq: number; matchId: number; flags: number };
  peerStatus: { matchId: number; event: number; graceMs: number };
  result: {
    seq: number;
    matchId: number;
    winner: number;
    reason: number;
    ticks: number;
    finalHash: number;
  };
  resultAck: { matchId: number; status: number };
  ping: { nonce: number };
  pong: { nonce: number };
  error: { code: number; retryAfterSec: number; detail: number };
}

export type FrameName = keyof FrameFields;
export type Frame = { [K in FrameName]: { readonly t: K } & FrameFields[K] }[FrameName];

export type DecodeResult =
  | { readonly ok: true; readonly frame: Frame }
  | {
      readonly ok: false;
      readonly code: typeof ErrorCode.badFrame | typeof ErrorCode.tooBig;
      readonly reason: string;
    };

type Kind = 'u8' | 'u16' | 'u32';
/** [field, width, optional inclusive maximum]. */
type Field = readonly [string, Kind, number?];

/** Plain fixed-layout frames. The others (room codes, SETUP, BATCH) are handled by hand. */
const FIXED: Partial<Record<FrameName, readonly Field[]>> = {
  hello: [
    ['ver', 'u8'],
    ['simVersion', 'u16'],
    ['resumeSession', 'u32'],
  ],
  welcome: [
    ['ver', 'u8'],
    ['sessionId', 'u32'],
    ['resumed', 'u8', 1],
    ['serverHint', 'u16'],
  ],
  queueJoin: [['mode', 'u8', 0]],
  queueLeave: [],
  queueState: [['waitingSec', 'u16']],
  roomCreate: [],
  roomPeer: [['event', 'u8', 1]],
  matchStart: [
    ['matchId', 'u8'],
    ['slot', 'u8', 1],
    ['seed', 'u32'],
    ['inputDelay', 'u8'],
    ['simVersion', 'u16'],
    ['batchEvery', 'u8'],
  ],
  hash: [
    ['seq', 'u32'],
    ['matchId', 'u8'],
    ['tick', 'u32'],
    ['hash', 'u32'],
  ],
  desync: [
    ['seq', 'u32'],
    ['matchId', 'u8'],
    ['tick', 'u32'],
    ['localHash', 'u32'],
    ['remoteHash', 'u32'],
  ],
  pause: [
    ['seq', 'u32'],
    ['matchId', 'u8'],
    ['flags', 'u8', 3],
  ],
  peerStatus: [
    ['matchId', 'u8'],
    ['event', 'u8', 2],
    ['graceMs', 'u16'],
  ],
  result: [
    ['seq', 'u32'],
    ['matchId', 'u8'],
    ['winner', 'u8', 2],
    ['reason', 'u8', 3],
    ['ticks', 'u32'],
    ['finalHash', 'u32'],
  ],
  resultAck: [
    ['matchId', 'u8'],
    ['status', 'u8', 2],
  ],
  ping: [['nonce', 'u32']],
  pong: [['nonce', 'u32']],
  error: [
    ['code', 'u16'],
    ['retryAfterSec', 'u16'],
    ['detail', 'u16'],
  ],
};

const WIDTH: Record<Kind, number> = { u8: 1, u16: 2, u32: 4 };
const NAME_BY_TYPE = new Map<number, FrameName>(
  Object.entries(FrameType).map(([k, v]) => [v, k as FrameName]),
);
const fixedSize = (fields: readonly Field[]): number => fields.reduce((n, f) => n + WIDTH[f[1]], 1);

/** Frame types a client may send / a client may receive (spec section 4 "Dir"). */
const C2S = new Set<FrameName>([
  'hello',
  'queueJoin',
  'queueLeave',
  'roomCreate',
  'roomJoin',
  'setup',
  'batch',
  'hash',
  'desync',
  'pause',
  'result',
  'ping',
]);
const S2C = new Set<FrameName>([
  'welcome',
  'queueState',
  'roomCreated',
  'roomPeer',
  'matchStart',
  'setup',
  'batch',
  'pause',
  'peerStatus',
  'resultAck',
  'pong',
  'error',
]);

const fail = (
  code: typeof ErrorCode.badFrame | typeof ErrorCode.tooBig,
  reason: string,
): DecodeResult => ({ ok: false, code, reason });
const ok = (frame: Frame): DecodeResult => ({ ok: true, frame });

function maxFrameSize(name: FrameName): number {
  if (name === 'batch') return MAX_BATCH_FRAME;
  if (name === 'setup') return MAX_SETUP_FRAME;
  if (name === 'roomJoin') return 1 + CODE_LENGTH;
  if (name === 'roomCreated') return 1 + CODE_LENGTH + 2;
  return fixedSize(FIXED[name] ?? []);
}

/** Validates a BATCH payload exactly as `decodePacket` does (12 + 4n + 8m bytes, n <= 64, m <= 4) without interpreting inputs. */
function batchLengthOk(p: Uint8Array): boolean {
  if (p.length < 12) return false;
  const n = p[10] as number;
  if (n > MAX_INPUTS_PER_BATCH || p.length < 12 + 4 * n) return false;
  const m = p[11 + 4 * n] as number;
  return m <= MAX_HASHES_PER_BATCH && p.length === 12 + 4 * n + 8 * m;
}

function readCode(dv: DataView, at: number): string | undefined {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    let c = dv.getUint8(at + i);
    if (c >= 0x61 && c <= 0x7a) c -= 0x20;
    if (c < 0x21 || c > 0x7e) return undefined;
    s += String.fromCharCode(c);
  }
  return s;
}

/**
 * Decodes one binary frame. Never throws: anything wrong comes back as `{ ok: false }` with the error code to answer
 * (`too-big` when over the frame's cap, `bad-frame` otherwise). `dir` limits the accepted types: 'c2s' is what the
 * server accepts from a client, 's2c' what a client accepts from the server; omit it to accept all.
 */
export function decodeFrame(buf: Uint8Array, dir?: 'c2s' | 's2c'): DecodeResult {
  if (buf.length === 0) return fail(ErrorCode.badFrame, 'empty frame');
  const name = NAME_BY_TYPE.get(buf[0] as number);
  if (name === undefined) return fail(ErrorCode.badFrame, 'unknown type');
  if (dir !== undefined && !(dir === 'c2s' ? C2S : S2C).has(name))
    return fail(ErrorCode.badFrame, 'type not allowed in this direction');
  if (buf.length > maxFrameSize(name)) return fail(ErrorCode.tooBig, 'frame too big');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const fixed = FIXED[name];
  if (fixed !== undefined) {
    if (buf.length !== fixedSize(fixed)) return fail(ErrorCode.badFrame, 'wrong length');
    const out: Record<string, unknown> = { t: name };
    let o = 1;
    for (const [field, kind, max] of fixed) {
      const v = kind === 'u8' ? dv.getUint8(o) : kind === 'u16' ? dv.getUint16(o) : dv.getUint32(o);
      if (max !== undefined && v > max) return fail(ErrorCode.badFrame, `${field} out of range`);
      out[field] = v;
      o += WIDTH[kind];
    }
    return ok(out as unknown as Frame);
  }
  if (name === 'roomJoin' || name === 'roomCreated') {
    if (buf.length !== maxFrameSize(name)) return fail(ErrorCode.badFrame, 'wrong length');
    const code = readCode(dv, 1);
    if (code === undefined) return fail(ErrorCode.badFrame, 'bad code characters');
    return ok(
      name === 'roomJoin'
        ? { t: name, code }
        : { t: name, code, ttlSec: dv.getUint16(1 + CODE_LENGTH) },
    );
  }
  if (name === 'setup') {
    if (buf.length < 9) return fail(ErrorCode.badFrame, 'short setup');
    const n = dv.getUint16(7);
    if (n > MAX_SETUP_BYTES) return fail(ErrorCode.tooBig, 'setup blob too big');
    if (buf.length !== 9 + n) return fail(ErrorCode.badFrame, 'wrong length');
    return ok({
      t: 'setup',
      seq: dv.getUint32(1),
      ctlSeq: dv.getUint8(5),
      ackCtl: dv.getUint8(6),
      blob: buf.slice(9),
    });
  }
  // batch
  if (buf.length < 5 + 12) return fail(ErrorCode.badFrame, 'short batch');
  const packet = buf.slice(5);
  if (!batchLengthOk(packet)) return fail(ErrorCode.badFrame, 'bad batch layout');
  return ok({ t: 'batch', seq: dv.getUint32(1), match: packet[0] as number, packet });
}

/** Encodes one frame. Programmer errors (oversized blob or packet, wrong code length) throw RangeError; decoding is the untrusted side. */
export function encodeFrame(frame: Frame): Uint8Array {
  const f = frame as { t: FrameName } & Record<string, unknown>;
  const type = FrameType[f.t];
  const fixed = FIXED[f.t];
  if (fixed !== undefined) {
    const buf = new Uint8Array(fixedSize(fixed));
    const dv = new DataView(buf.buffer);
    buf[0] = type;
    let o = 1;
    for (const [field, kind] of fixed) {
      const v = f[field] as number;
      if (kind === 'u8') dv.setUint8(o, v);
      else if (kind === 'u16') dv.setUint16(o, v);
      else dv.setUint32(o, v);
      o += WIDTH[kind];
    }
    return buf;
  }
  if (f.t === 'roomJoin' || f.t === 'roomCreated') {
    const code = f['code'] as string;
    if (code.length !== CODE_LENGTH) throw new RangeError('room code length');
    const buf = new Uint8Array(f.t === 'roomJoin' ? 1 + CODE_LENGTH : 1 + CODE_LENGTH + 2);
    buf[0] = type;
    for (let i = 0; i < CODE_LENGTH; i++) buf[1 + i] = code.charCodeAt(i) & 0x7f;
    if (f.t === 'roomCreated')
      new DataView(buf.buffer).setUint16(1 + CODE_LENGTH, f['ttlSec'] as number);
    return buf;
  }
  if (f.t === 'setup') {
    const blob = f['blob'] as Uint8Array;
    if (blob.length > MAX_SETUP_BYTES) throw new RangeError('setup blob too big');
    const buf = new Uint8Array(9 + blob.length);
    const dv = new DataView(buf.buffer);
    buf[0] = type;
    dv.setUint32(1, f['seq'] as number);
    dv.setUint8(5, f['ctlSeq'] as number);
    dv.setUint8(6, f['ackCtl'] as number);
    dv.setUint16(7, blob.length);
    buf.set(blob, 9);
    return buf;
  }
  const packet = f['packet'] as Uint8Array;
  if (!batchLengthOk(packet)) throw new RangeError('batch packet layout');
  const buf = new Uint8Array(5 + packet.length);
  buf[0] = type;
  new DataView(buf.buffer).setUint32(1, f['seq'] as number);
  buf.set(packet, 5);
  return buf;
}
