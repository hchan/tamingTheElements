import type { SocketLike } from '../../game/net/ws/transport';
import { decodeText, encodeText } from '../../game/net/ws/text-codec';
import { decodeFrame, encodeFrame, FrameType } from '../../game/net/ws/wire';
import { seedSfc32 } from '../../core/rng/seed';
import type { Sfc32 } from '../../core/rng/sfc32';

/** In-memory WebSocket: `sent` collects what the client wrote (decoded from its base64 text); `deliver` plays a server message (a text) to the client. */
export class FakeSocket implements SocketLike {
  readyState = 1;
  readonly sent: Uint8Array[] = [];
  onSend: ((bytes: Uint8Array) => void) | undefined;
  private readonly onMessage: ((ev: { data: unknown }) => void)[] = [];
  private readonly onClose: (() => void)[] = [];

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('closed');
    const bytes = decodeText(data);
    if (bytes === undefined) throw new Error('not base64 text');
    this.sent.push(bytes);
    this.onSend?.(bytes);
  }

  addEventListener(type: 'message' | 'close', listener: ((ev: { data: unknown }) => void) & (() => void)): void {
    (type === 'message' ? this.onMessage : this.onClose).push(listener);
  }

  deliver(data: unknown): void {
    for (const l of this.onMessage) l({ data });
  }

  close(): void {
    this.readyState = 3;
    for (const l of this.onClose) l();
  }
}

export interface RelayConditions {
  /** One-way delay per leg in ms (client to relay, relay to client counted together as `latencyMs`). */
  readonly latencyMs: number;
  readonly jitterMs: number;
  /** Probability a relayed frame is delivered twice. */
  readonly duplicate: number;
}

export const CALM_RELAY: RelayConditions = { latencyMs: 0, jitterMs: 0, duplicate: 0 };

interface Due {
  readonly at: number;
  readonly order: number;
  readonly to: FakeSocket;
  readonly bytes: Uint8Array;
}

const RELAYED: ReadonlySet<number> = new Set([FrameType.setup, FrameType.batch, FrameType.pause]);

/**
 * Stand-in for the relay between two FakeSockets on a virtual clock. It forwards SETUP, BATCH and PAUSE unchanged to the other
 * side (never renumbering), answers PING with PONG and swallows the rest. Jitter reorders frames; `stall` models TCP head-of-line
 * blocking (everything towards one side waits for the stuck frame, then arrives in one burst, in order). Seeded: same run, same result.
 */
export class FakeRelay {
  readonly a = new FakeSocket();
  readonly b = new FakeSocket();
  /** Frames the server swallowed (HASH, RESULT, ...), for assertions. */
  readonly seen: Uint8Array[] = [];
  private readonly rng: Sfc32;
  private readonly due: Due[] = [];
  private readonly holdUntil = new Map<FakeSocket, number>();
  private order = 0;

  constructor(
    private readonly clock: { ms: number },
    seed: number,
    private readonly cond: RelayConditions = CALM_RELAY,
  ) {
    this.rng = seedSfc32(seed, 'fake-relay');
    this.a.onSend = (m) => { this.route(this.a, this.b, m); };
    this.b.onSend = (m) => { this.route(this.b, this.a, m); };
  }

  /** From now until `untilMs` every frame towards `to` is held, then released together. */
  stall(to: FakeSocket, untilMs: number): void {
    this.holdUntil.set(to, untilMs);
  }

  /** Delivers everything due at the current clock time. Call once per virtual step. */
  advance(): void {
    this.due.sort((x, y) => x.at - y.at || x.order - y.order);
    while (this.due[0] && this.due[0].at <= this.clock.ms) {
      const d = this.due.shift();
      if (d) d.to.deliver(encodeText(d.bytes));
    }
  }

  private route(from: FakeSocket, to: FakeSocket, m: Uint8Array): void {
    const f = decodeFrame(m);
    if (f?.t === 'ping') this.schedule(from, encodeFrame({ t: 'pong', nonce: f.nonce }), 0);
    else if (RELAYED.has(m[0] ?? 0)) {
      this.schedule(to, m, this.cond.latencyMs);
      if (this.cond.duplicate > 0 && this.rng.chance(this.cond.duplicate)) this.schedule(to, m, this.cond.latencyMs);
    } else this.seen.push(m);
  }

  private schedule(to: FakeSocket, bytes: Uint8Array, base: number): void {
    const j = this.cond.jitterMs > 0 ? this.rng.int(this.cond.jitterMs + 1) : 0;
    const hold = this.holdUntil.get(to) ?? 0;
    this.due.push({ at: Math.max(this.clock.ms + base + j, hold), order: this.order++, to, bytes: bytes.slice() });
  }
}
