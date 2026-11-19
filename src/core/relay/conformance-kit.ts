/**
 * Shared types and golden vectors of the conformance suite (see conformance.ts).
 * Framework-agnostic: plain case objects that throw on failure, and a tiny runner. A backend points it at a deployed or local
 * relay through its own WebSocket glue (a `ConformanceAdapter`). No timers, clocks or test-framework imports live here: waiting
 * goes through `hooks.sleep`, which a remote adapter should supply (default: yield only, enough for an in-process relay).
 */
import type { Frame } from './codec';

/** One client connection to the relay under test. Frames travel as base64 TEXT messages (v3 wire); the harness does the encoding. */
export interface ConformanceClient {
  /** One TEXT WebSocket message (the base64 text of one frame). */
  sendText(text: string): void | Promise<void>;
  /** Optional: one BINARY message (a protocol error); the binary-message case is skipped without it. */
  sendBinary?(bytes: Uint8Array): void | Promise<void>;
  /** Registers the receiver of every TEXT message from the relay (call once, right after connect). Binary messages are never expected. */
  onText(cb: (text: string) => void): void;
  /** Registers the receiver of the close event (the WebSocket close code; advisory after an ERROR frame, which is the authority). */
  onClose(cb: (code: number) => void): void;
  /** Closes the socket from the client side (an abrupt drop as far as the relay is concerned). */
  close(): void | Promise<void>;
}

/** Opens a fresh connection (the ticket flow, if any, is the adapter's business). Each call is one independent socket. */
export interface ConformanceAdapter {
  connect(): Promise<ConformanceClient>;
}

export interface ConformanceHooks {
  /** Waits `ms`. Remote adapters should pass a real timer; the default only yields to the event loop. */
  sleep?(ms: number): Promise<void>;
  /** Kill switch: `number` = resting with that retryAfterSec, `null` = switched off again. Cases that need it are skipped without it. */
  setResting?(retryAfterSec: number | null): void | Promise<void>;
  /** Moves the relay's notion of time forward by `ms` and runs its housekeeping (RelayCore.sweep). Cases that need it are skipped without it. */
  advanceTime?(ms: number): void | Promise<void>;
  /** Max wait for an expected frame in `sleep` milliseconds (default 2000). */
  timeoutMs?: number;
  /** Quiet period used to assert that something did NOT arrive (default 50). */
  settleMs?: number;
  /** The simVersion sent in HELLO (default 1). */
  simVersion?: number;
}

export interface ConformanceCase {
  readonly id: string;
  /** Section of docs/ONLINE-PROTOCOL.md the rule comes from. */
  readonly spec: string;
  readonly title: string;
  /** Throws on failure; throws `ConformanceSkip` (via `skip`) when a needed hook or capability is missing. */
  run(adapter: ConformanceAdapter, hooks: ConformanceHooks): Promise<void>;
}

export class ConformanceSkip extends Error {}
export const skip = (reason: string): never => {
  throw new ConformanceSkip(reason);
};

export interface CaseResult {
  readonly id: string;
  readonly spec: string;
  readonly status: 'pass' | 'fail' | 'skip';
  readonly message?: string;
}
export interface ConformanceReport {
  readonly ok: boolean;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly results: readonly CaseResult[];
}

// ---- golden byte vectors (spec section 4; written by hand from the table, not produced by the codec) ----------------------

export interface GoldenFrame {
  readonly id: string;
  readonly hex: string;
  /** The base64 text form of `hex` (v3 wire, RFC 4648 section 4 with padding). */
  readonly text: string;
  readonly frame: Frame;
}

const packetHex = '01 00 00000002 00000003 01 00000102 01 00000004 00000005'.replace(/ /g, '');
export const fromHex = (hex: string): Uint8Array =>
  Uint8Array.from((hex.replace(/\s+/g, '').match(/../g) ?? []).map((h) => parseInt(h, 16)));
export const toHex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export const goldenFrames: readonly GoldenFrame[] = [
  { id: 'hello', hex: '01 01 0007 0a0b0c0d', text: 'AQEABwoLDA0=', frame: { t: 'hello', ver: 1, simVersion: 7, resumeSession: 0x0a0b0c0d } },
  { id: 'welcome', hex: '02 01 00000042 00 0040', text: 'AgEAAABCAABA', frame: { t: 'welcome', ver: 1, sessionId: 0x42, resumed: 0, serverHint: 64 } },
  { id: 'queueJoin', hex: '10 00', text: 'EAA=', frame: { t: 'queueJoin', mode: 0 } },
  { id: 'queueLeave', hex: '11', text: 'EQ==', frame: { t: 'queueLeave' } },
  { id: 'queueState', hex: '12 0005', text: 'EgAF', frame: { t: 'queueState', waitingSec: 5 } },
  { id: 'roomCreate', hex: '20', text: 'IA==', frame: { t: 'roomCreate' } },
  { id: 'roomCreated', hex: '21 414243444546 0258', text: 'IUFCQ0RFRgJY', frame: { t: 'roomCreated', code: 'ABCDEF', ttlSec: 600 } },
  { id: 'roomJoin', hex: '22 414243444546', text: 'IkFCQ0RFRg==', frame: { t: 'roomJoin', code: 'ABCDEF' } },
  { id: 'roomPeer', hex: '23 01', text: 'IwE=', frame: { t: 'roomPeer', event: 1 } },
  { id: 'matchStart', hex: '30 03 01 01020304 02 0007 01', text: 'MAMBAQIDBAIABwE=', frame: { t: 'matchStart', matchId: 3, slot: 1, seed: 0x01020304, inputDelay: 2, simVersion: 7, batchEvery: 1 } },
  { id: 'setup', hex: '31 00000000 05 ff 0003 0a0b0c', text: 'MQAAAAAF/wADCgsM', frame: { t: 'setup', seq: 0, ctlSeq: 5, ackCtl: 0xff, blob: Uint8Array.of(10, 11, 12) } },
  { id: 'batch', hex: `40 00000009 ${packetHex}`, text: 'QAAAAAkBAAAAAAIAAAADAQAAAQIBAAAABAAAAAU=', frame: { t: 'batch', seq: 9, match: 1, packet: fromHex(packetHex) } },
  { id: 'hash', hex: '41 00000001 02 00000032 deadbeef', text: 'QQAAAAECAAAAMt6tvu8=', frame: { t: 'hash', seq: 1, matchId: 2, tick: 50, hash: 0xdeadbeef } },
  { id: 'desync', hex: '42 00000002 02 00000064 11111111 22222222', text: 'QgAAAAICAAAAZBEREREiIiIi', frame: { t: 'desync', seq: 2, matchId: 2, tick: 100, localHash: 0x11111111, remoteHash: 0x22222222 } },
  { id: 'pause', hex: '43 00000003 02 01', text: 'QwAAAAMCAQ==', frame: { t: 'pause', seq: 3, matchId: 2, flags: 1 } },
  { id: 'peerStatus', hex: '44 02 00 2710', text: 'RAIAJxA=', frame: { t: 'peerStatus', matchId: 2, event: 0, graceMs: 10000 } },
  { id: 'result', hex: '50 00000004 02 01 00 00001388 cafebabe', text: 'UAAAAAQCAQAAABOIyv66vg==', frame: { t: 'result', seq: 4, matchId: 2, winner: 1, reason: 0, ticks: 5000, finalHash: 0xcafebabe } },
  { id: 'resultAck', hex: '51 02 00', text: 'UQIA', frame: { t: 'resultAck', matchId: 2, status: 0 } },
  { id: 'ping', hex: '60 01020304', text: 'YAECAwQ=', frame: { t: 'ping', nonce: 0x01020304 } },
  { id: 'pong', hex: '61 01020304', text: 'YQECAwQ=', frame: { t: 'pong', nonce: 0x01020304 } },
  { id: 'error', hex: '7f 000b 0078 0000', text: 'fwALAHgAAA==', frame: { t: 'error', code: 0x0b, retryAfterSec: 120, detail: 0 } },
];
