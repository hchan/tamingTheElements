import { checkHello, decodeHello, encodeHello, type HandshakeMismatch, type Hello } from './handshake';

/**
 * Reliable, ordered message pipe (the second WebRTC data channel: `negotiated: true, id: 1`). Each message is one
 * whole byte array. Unlike `Transport` nothing is lost or reordered, so the setup protocol needs no timers.
 */
export interface ControlPipe {
  send(message: Uint8Array): void;
  receive(): Uint8Array | undefined;
}

const MSG_HELLO = 1;
const MSG_READY = 2;
const MSG_REJECT = 3;

const MISMATCHES: readonly HandshakeMismatch[] = ['simVersion', 'flags', 'cheats', 'seed', 'chapter', 'difficulty', 'roster'];

export type SetupPhase = 'waiting-hello' | 'waiting-ready' | 'go' | 'rejected';

/**
 * Match-setup protocol over the control channel, run by both peers symmetrically:
 * 1. each sends HELLO (simVersion, flags, seed, rosters) and checks the other's;
 * 2. on a match each sends READY; when both READY are in, the phase is `go` and tick 0 may start;
 * 3. on a mismatch (or a malformed message) the peer is told with REJECT and the phase is `rejected`, with the reason.
 * The peer is untrusted: nothing here throws on bad input, and a decided phase never changes.
 */
export class SetupHandshake {
  private mine: Hello;
  private helloSent = false;
  private readySent = false;
  private peerReady = false;
  private peerHelloOk = false;
  private state: SetupPhase = 'waiting-hello';
  private why: HandshakeMismatch | 'malformed' | 'peer-rejected' | undefined;

  constructor(
    private readonly pipe: ControlPipe,
    local: Hello,
  ) {
    this.mine = local;
  }

  get phase(): SetupPhase {
    return this.state;
  }

  /** Why the setup was rejected (ours or the peer's); undefined unless `rejected`. */
  get reason(): HandshakeMismatch | 'malformed' | 'peer-rejected' | undefined {
    return this.why;
  }

  /** Drive the protocol: send our HELLO once, then handle everything that has arrived. Call once per frame. */
  poll(): SetupPhase {
    if (this.state === 'rejected' || this.state === 'go') return this.state;
    if (!this.helloSent) {
      this.helloSent = true;
      this.pipe.send(prefixed(MSG_HELLO, encodeHello(this.mine)));
    }
    for (let m = this.pipe.receive(); m !== undefined && !this.isRejected; m = this.pipe.receive()) this.handle(m);
    if (!this.isRejected && this.peerHelloOk && this.peerReady && this.readySent) this.state = 'go';
    return this.state;
  }

  private get isRejected(): boolean {
    return this.state === 'rejected';
  }

  private handle(m: Uint8Array): void {
    const kind = m[0];
    if (kind === MSG_HELLO) {
      const remote = decodeHello(m.subarray(1));
      if (!remote) {
        this.reject('malformed', undefined);
        return;
      }
      const bad = checkHello(this.mine, remote);
      if (bad) {
        this.reject(bad, bad);
        return;
      }
      this.peerHelloOk = true;
      if (!this.readySent) {
        this.readySent = true;
        this.state = 'waiting-ready';
        this.pipe.send(Uint8Array.of(MSG_READY));
      }
    } else if (kind === MSG_READY) {
      // READY before a checked HELLO is a protocol error; the channel is ordered, so it cannot happen honestly.
      if (!this.peerHelloOk) {
        this.reject('malformed', undefined);
        return;
      }
      this.peerReady = true;
    } else if (kind === MSG_REJECT) {
      this.state = 'rejected';
      this.why = 'peer-rejected';
    } else this.reject('malformed', undefined);
  }

  private reject(why: HandshakeMismatch | 'malformed', tell: HandshakeMismatch | undefined): void {
    this.state = 'rejected';
    this.why = why;
    this.pipe.send(Uint8Array.of(MSG_REJECT, tell ? MISMATCHES.indexOf(tell) : 255));
  }
}

function prefixed(kind: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 1);
  out[0] = kind;
  out.set(body, 1);
  return out;
}
