import type { ControlPipe, Transport } from '@core/index';
import { ControlLink } from './control-link';
import { RTT_WINDOW } from '../link-quality';
import { ReorderBuffer } from './reorder';
import { inboundBytes } from './inbound';
import { encodeText } from './text-codec';
import { decodeFrame, encodeFrame, FrameType, MAX_BATCH_BYTES, type Frame } from './wire';

/** The slice of WebSocket the transport uses (tests fake it). `readyState` 1 = open. */
export interface SocketLike {
  readonly readyState: number;
  /** Set to 'arraybuffer' by the client so binary messages decode synchronously and keep their order. */
  binaryType?: string;
  /** One base64 text message per frame (wire v3). */
  send(data: string): void;
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
  addEventListener(type: 'close', listener: () => void): void;
}

/** Cap on queued inbound packets (a flood or a long stall burst); the oldest go first, redundant batches repair it. */
export const MAX_QUEUED = 256;
/** DESYNC and RESULT are resent this often until stopped [choice, spec section 6]. */
export const RETRY_MS = 500;
/** After RESULT_ACK 1 (waiting) the client re-sends RESULT this often until ACK 0/2 [estimate: slow enough not to load the relay, fast enough to repair a lost final ACK]. */
export const RESULT_REPOLL_MS = 2000;
/** The re-poll gives up this long after the first ACK 1 [choice, estimate: about the relay's peer-gone wait]. */
export const RESULT_REPOLL_CAP_MS = 30_000;
/** "Play again" waits this long for the RESULT_ACK before it joins the queue anyway [choice, estimate: about 3 RTTs of a slow link]. */
export const PLAY_AGAIN_ACK_WAIT_MS = 1500;

type Match = Extract<Frame, { seq: number }>;
type Resendable = Extract<Frame, { t: 'desync' | 'result' }>;

/**
 * `Transport` over one WebSocket to the relay (docs/ONLINE-PROTOCOL.md). `send` wraps an encoded Packet in a numbered BATCH frame;
 * `receive` returns the packets of the peer's BATCH frames after the per-sender reorder buffer (duplicates dropped, gaps skipped
 * after 40 ms), so the session sees the same "late, missing, duplicated" link as an unreliable datagram link and handles it with its rollback or
 * stall logic. After a TCP stall many frames arrive in one burst: they all queue, and `receive` drains them in one `update`.
 * `control` is the reliable SETUP stream. `receive` also drives the timers (control resend, DESYNC/RESULT retry), so call it every update.
 */
export class WebSocketTransport implements Transport {
  readonly control: ControlPipe;
  /** Latest round trips in ms (last RTT_WINDOW), for `medianRtt`/`linkQuality`. */
  readonly rtts: number[] = [];
  /** Latest peer PAUSE frame, if any; `lastError` is the latest ERROR frame from the server. */
  peerPause: { readonly matchId: number; readonly flags: number } | undefined;
  lastError: Extract<Frame, { t: 'error' }> | undefined;
  closed = false;
  malformed = 0;
  /** Match-phase frames dropped for carrying another matchId than the current one. */
  staleMatch = 0;
  /** matchId of the latest MATCH_START (`startMatch`); `undefined` before the first (everything is accepted then). */
  matchId: number | undefined;
  private readonly link: ControlLink;
  private reorder = new ReorderBuffer<Frame>();
  private readonly queue: Uint8Array[] = [];
  private readonly pings = new Map<number, number>();
  private readonly retries = new Map<number, { frame: Resendable; at: number }>();
  /** Called after each `sendResult` (the client starts its own RESULT timers from it). */
  onResultSent: (() => void) | undefined;
  private lastResult: Extract<Frame, { t: 'result' }> | undefined;
  private seq = 0;
  private nonce = 0;
  /** The match is over (`endMatch`): late BATCH and PAUSE from a session that is still shutting down are dropped, not sent as a bad frame for the next lobby state. */
  private ended = false;

  constructor(
    private readonly socket: SocketLike,
    private readonly now: () => number,
  ) {
    this.link = new ControlLink((ctlSeq, ackCtl, body) => { this.raw({ t: 'setup', ctlSeq, ackCtl, body }); }, now);
    this.control = this.link;
    socket.addEventListener('message', (ev) => { this.onMessage(ev.data); });
    socket.addEventListener('close', () => { this.closed = true; });
  }

  /**
   * MATCH_START arrived (docs/ONLINE-PROTOCOL.md sections 6 and 7). `resumed` false: a new match, so the BATCH/PAUSE seq, the reorder buffer,
   * the control link, queued packets and retries start again; true: the same match on a new socket, nothing is reset.
   */
  startMatch(matchId: number, resumed: boolean): void {
    this.matchId = matchId;
    this.ended = false;
    if (resumed) return;
    this.seq = 0;
    this.reorder = new ReorderBuffer<Frame>();
    this.link.reset();
    this.queue.length = 0;
    this.retries.clear();
    this.lastResult = undefined;
    this.peerPause = undefined;
  }

  /** The match is over: stop sending match frames until the next `startMatch`. */
  endMatch(): void {
    this.ended = true;
  }

  send(packet: Uint8Array): void {
    if (this.ended || packet.length + 5 > MAX_BATCH_BYTES) return;
    this.raw({ t: 'batch', seq: this.nextSeq(), packet });
  }

  /** Server-bound checkpoint frames (seq 0: only BATCH and PAUSE are numbered). DESYNC and RESULT are repeated until `stopRetry`. */
  sendHash(matchId: number, tick: number, hash: number): void {
    this.raw({ t: 'hash', seq: 0, matchId, tick, hash });
  }

  sendPause(matchId: number, flags: number): void {
    if (this.ended) return;
    this.raw({ t: 'pause', seq: this.nextSeq(), matchId, flags });
  }

  sendDesync(matchId: number, tick: number, localHash: number, remoteHash: number): void {
    this.retry({ t: 'desync', seq: 0, matchId, tick, localHash, remoteHash });
  }

  sendResult(matchId: number, winner: number, reason: number, ticks: number, finalHash: number): void {
    const frame = { t: 'result', seq: 0, matchId, winner, reason, ticks, finalHash } as const;
    this.lastResult = frame;
    this.retry(frame);
    this.onResultSent?.();
  }

  /** Sends the last RESULT once more (the client's slow re-poll); false when there is none for the current match. */
  resendResult(): boolean {
    const f = this.lastResult;
    if (f === undefined || (this.matchId !== undefined && f.matchId !== this.matchId)) return false;
    this.raw(f);
    return true;
  }

  /** Stops resending DESYNC and RESULT (on RESULT_ACK or match end). */
  stopRetry(): void {
    this.retries.clear();
  }

  /** Sends a PING; the PONG appends a round trip to `rtts`. Call about every 2 s. */
  ping(): void {
    const n = this.nonce++ >>> 0;
    this.pings.set(n, this.now());
    if (this.pings.size > RTT_WINDOW) this.pings.delete(this.pings.keys().next().value as number);
    this.raw({ t: 'ping', nonce: n });
  }

  receive(): Uint8Array | undefined {
    this.tick();
    return this.queue.shift();
  }

  /** Timers: control resend, reorder skip-ahead, DESYNC/RESULT retry. `receive` calls it; call it directly while only `control` is in use (setup). */
  tick(): void {
    const t = this.now();
    this.link.tick(t);
    for (const f of this.reorder.poll(t)) this.deliver(f);
    for (const r of this.retries.values()) {
      if (t - r.at >= RETRY_MS) {
        r.at = t;
        this.raw(r.frame);
      }
    }
  }

  private nextSeq(): number {
    const s = this.seq;
    this.seq = (this.seq + 1) >>> 0;
    return s;
  }

  private retry(frame: Resendable): void {
    this.retries.set(frame.t === 'desync' ? FrameType.desync : FrameType.result, { frame, at: this.now() });
    this.raw(frame);
  }

  /** Never throws: a closed socket just loses the frame (the session timeout ends a dead link). */
  private raw(f: Frame): void {
    if (this.socket.readyState !== 1) return;
    try {
      this.socket.send(encodeText(encodeFrame(f)));
    } catch {
      // Closed between the check and the send.
    }
  }

  private onMessage(data: unknown): void {
    // Text, or ASCII text in a binary frame (docs/ONLINE-PROTOCOL.md); anything else is malformed in wire v3.
    const bytes = inboundBytes(data);
    const f = bytes === undefined ? undefined : decodeFrame(bytes);
    if (f === undefined) {
      this.malformed++;
      return;
    }
    switch (f.t) {
      case 'batch':
      case 'pause':
        if (this.matchId !== undefined && (f.t === 'batch' ? f.packet[0] : f.matchId) !== this.matchId) {
          this.staleMatch++;
          break;
        }
        for (const d of this.reorder.push((f as Match).seq, f, this.now(), f.t === 'batch')) this.deliver(d);
        break;
      case 'setup':
        this.link.onFrame(f.ctlSeq, f.ackCtl, f.body);
        break;
      case 'pong': {
        const sent = this.pings.get(f.nonce);
        if (sent === undefined) break;
        this.pings.delete(f.nonce);
        this.rtts.push(this.now() - sent);
        if (this.rtts.length > RTT_WINDOW) this.rtts.shift();
        break;
      }
      case 'error':
        this.lastError = f;
        break;
      default:
        break;
    }
  }

  private deliver(f: Frame): void {
    if (f.t === 'pause') this.peerPause = { matchId: f.matchId, flags: f.flags };
    else if (f.t === 'batch') {
      if (this.queue.length >= MAX_QUEUED) this.queue.shift();
      this.queue.push(f.packet);
    }
  }
}
