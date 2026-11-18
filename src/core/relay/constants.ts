/** Wire constants of docs/ONLINE-PROTOCOL.md. A change to any frame layout or value here is a MAJOR package bump (docs/RELAY-PACKAGE.md). */

/** First byte of HELLO and WELCOME. Exact match required (spec section 2). */
export const PROTOCOL_VERSION = 1;

export const FrameType = {
  hello: 0x01,
  welcome: 0x02,
  queueJoin: 0x10,
  queueLeave: 0x11,
  queueState: 0x12,
  roomCreate: 0x20,
  roomCreated: 0x21,
  roomJoin: 0x22,
  roomPeer: 0x23,
  matchStart: 0x30,
  setup: 0x31,
  batch: 0x40,
  hash: 0x41,
  desync: 0x42,
  pause: 0x43,
  peerStatus: 0x44,
  result: 0x50,
  resultAck: 0x51,
  ping: 0x60,
  pong: 0x61,
  error: 0x7f,
} as const;

export const ErrorCode = {
  badFrame: 0x0001,
  tooBig: 0x0002,
  versionMismatch: 0x0003,
  ticketInvalid: 0x0004,
  busy: 0x0005,
  noRoom: 0x0006,
  full: 0x0007,
  fullHouse: 0x0008,
  rateLimited: 0x0009,
  simMismatch: 0x000a,
  resting: 0x000b,
  internal: 0x000c,
} as const;
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** WebSocket close code for an error: 4000 + the low byte of the code (spec section 5). */
export function closeCodeFor(code: number): number {
  return 4000 + (code & 0xff);
}
export const CLOSE_NORMAL = 1000;

/** Max inputs and hashes in one BATCH Packet (same values as src/core/net/packet.ts; a test pins the agreement). */
export const MAX_INPUTS_PER_BATCH = 64;
export const MAX_HASHES_PER_BATCH = 4;
/** Max control blob bytes in SETUP (a type byte plus the handshake blob). */
export const MAX_SETUP_BYTES = 401;

export const MAX_BATCH_FRAME = 177;
export const MAX_SETUP_FRAME = 410;

export const RoomPeerEvent = { joined: 0, left: 1 } as const;
export const PeerStatusEvent = { disconnected: 0, back: 1, gone: 2 } as const;
export const ResultStatus = { agreed: 0, waiting: 1, disagreed: 2 } as const;
export const ResultReason = { natural: 0, forfeit: 1, timeout: 2, desync: 3 } as const;
export const PauseFlag = { paused: 1, forfeit: 2 } as const;

/** Spec section 7. */
export const DISCONNECT_GRACE_MS = 10_000;
/** Spec section 5, resting: close after the current match ends or after this long. */
export const RESTING_CLOSE_MS = 60_000;
export const DEFAULT_INPUT_DELAY = 2;
/** The session sends every update today (spec section 9), so the default is 1. */
export const DEFAULT_BATCH_EVERY = 1;
/** Hold buffer and skip-ahead timeout of the receiver (spec section 6). */
export const REORDER_HOLD_MAX = 8;
export const REORDER_SKIP_MS = 40;
/** A finished or abandoned match record lives this long in the store [estimate]. */
export const MATCH_RECORD_TTL_MS = 2 * 60 * 60_000;
