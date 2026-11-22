import { ROOM_CODE_RE } from '../relay';

/** Lobby-side frames (spec section 4) that `wire.ts` does not carry. */
export type Lobby =
  | { t: 'welcome'; ver: number; sessionId: number; resumed: boolean; caps: number }
  | { t: 'queue'; waitingSec: number }
  | { t: 'room-created'; code: string; ttlSec: number }
  | { t: 'room-peer'; joined: boolean }
  | { t: 'match'; matchId: number; slot: number; seed: number; inputDelay: number; simVersion: number; batchEvery: number }
  | { t: 'peer'; matchId: number; status: 'disconnected' | 'back' | 'gone'; graceMs: number }
  | { t: 'result-ack'; matchId: number; status: number };
const LOBBY_SIZE: Readonly<Record<number, number>> = { 0x02: 9, 0x12: 3, 0x21: 9, 0x23: 2, 0x30: 11, 0x44: 5, 0x51: 3 };
const PEER = ['disconnected', 'back', 'gone'] as const;

/** `undefined` for a non-lobby type or a malformed one (wrong length, bad room code or event). */
export function decodeLobby(b: Uint8Array): Lobby | undefined {
  const type = b[0] ?? 0;
  if (LOBBY_SIZE[type] !== b.length) return undefined;
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  switch (type) {
    case 0x02: return { t: 'welcome', ver: d.getUint8(1), sessionId: d.getUint32(2), resumed: d.getUint8(6) === 1, caps: d.getUint8(7) };
    case 0x12: return { t: 'queue', waitingSec: d.getUint16(1) };
    case 0x21: {
      const code = String.fromCharCode(...b.subarray(1, 7));
      return ROOM_CODE_RE.test(code) ? { t: 'room-created', code, ttlSec: d.getUint16(7) } : undefined;
    }
    case 0x23: return d.getUint8(1) <= 1 ? { t: 'room-peer', joined: d.getUint8(1) === 0 } : undefined;
    case 0x30: return { t: 'match', matchId: d.getUint8(1), slot: d.getUint8(2), seed: d.getUint32(3), inputDelay: d.getUint8(7), simVersion: d.getUint16(8), batchEvery: d.getUint8(10) };
    case 0x44: {
      const status = PEER[d.getUint8(2)];
      return status === undefined ? undefined : { t: 'peer', matchId: d.getUint8(1), status, graceMs: d.getUint16(3) };
    }
    default: return { t: 'result-ack', matchId: d.getUint8(1), status: d.getUint8(2) };
  }
}
