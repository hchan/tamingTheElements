import type { ControlPipe, Transport } from '@core/index';
import { DEFAULT_STUN } from './ice';
import { controlPipe, inputTransport } from './rtc-channels';
import { BAD_CODE, packSdp, unpackSdp } from './sdp-codec';

/** Public STUN servers (src/game/net/ice.ts); `iceFromSettings` adds the player's own TURN relay. */
export const DEFAULT_ICE: RTCIceServer[] = DEFAULT_STUN.map((urls) => ({ urls }));

/** Link states reported after the channels opened (`Peer.onState`). */
export type PeerState = 'connected' | 'disconnected' | 'failed' | 'closed';

/** Words for a link that failed before it opened: never colour alone, and says whether this looks like a strict network. */
export function failureWords(srflx: boolean): string {
  return srflx
    ? 'The connection failed. Check that you both used the latest codes and try again (a strict network may need a relay: see Settings).'
    : 'The connection failed and no public address was found, so this network may block direct links or be offline. Try another network, or add a relay (TURN) in Settings.';
}

/** One WebRTC link with the two negotiated channels of docs/NETCODE.md. */
export class Peer {
  readonly input: Transport;
  readonly control: ControlPipe;
  /** Resolves when both channels are open; rejects (with words from `failureWords`) if the link fails first. */
  readonly open: Promise<void>;
  /** True once a server-reflexive (STUN) candidate was gathered: the network reaches a public address. */
  srflx = false;
  private opened = false;
  private ended = false;
  private readonly listeners = new Set<(s: PeerState) => void>();

  constructor(
    readonly pc: RTCPeerConnection,
  ) {
    const input = pc.createDataChannel('input', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
    const control = pc.createDataChannel('control', { negotiated: true, id: 1 });
    this.input = inputTransport(input);
    this.control = controlPipe(control);
    pc.addEventListener('icecandidate', (e) => {
      const c = e.candidate;
      if (c && (c.type === 'srflx' || / typ srflx/.test(c.candidate))) this.srflx = true;
    });
    this.open = new Promise<void>((resolve, reject) => {
      let n = 0;
      const one = (): void => {
        if (++n === 2) {
          this.opened = true;
          resolve();
        }
      };
      input.addEventListener('open', one);
      control.addEventListener('open', one);
      pc.addEventListener('connectionstatechange', () => {
        const st = pc.connectionState;
        if (!this.opened) {
          if (st === 'failed' || st === 'closed') reject(new Error(failureWords(this.srflx)));
          return;
        }
        if (st === 'connected' || st === 'disconnected' || st === 'failed' || st === 'closed') this.emit(st);
      });
    });
    // A rejected `open` nobody awaits must not surface as an unhandled rejection.
    this.open.catch(() => undefined);
  }

  /** Reports link state changes after the channels opened (`disconnected` can recover to `connected`; `failed` and `closed` are final). Returns an unsubscribe. */
  onState(cb: (s: PeerState) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(s: PeerState): void {
    if (this.ended) return;
    if (s === 'failed' || s === 'closed') this.ended = true;
    for (const cb of [...this.listeners]) cb(s);
  }

  /** The host applies the joiner's answer code. */
  async accept(answer: string): Promise<void> {
    await this.pc.setRemoteDescription(decodeSignal(answer, 'answer'));
  }

  close(): void {
    this.pc.close();
    // A local close fires no connectionstatechange.
    if (this.opened) this.emit('closed');
  }
}

/**
 * A signalling code is a compact binary code (`T1.` prefix, src/game/net/sdp-codec.ts): short enough for a chat message or a QR
 * code, and it carries no gameplay. A description the compact form cannot carry falls back to the full SDP as base64 JSON.
 */
export function encodeSignal(d: RTCSessionDescriptionInit): string {
  return packSdp(d) ?? btoa(JSON.stringify({ type: d.type, sdp: d.sdp }));
}

/** Untrusted input from a pasted code (compact or the older base64 JSON): anything malformed or of the wrong kind throws a plain Error the UI can show. */
export function decodeSignal(code: string, want: 'offer' | 'answer'): RTCSessionDescriptionInit {
  const c = code.replace(/\s+/g, '');
  if (/^T\d+\./.test(c)) {
    const d = unpackSdp(c);
    if (d.type !== want) throw new Error(`That is not an ${want} code.`);
    return d;
  }
  let v: unknown;
  try {
    v = JSON.parse(atob(c));
  } catch {
    throw new Error(BAD_CODE);
  }
  const o = v as { type?: unknown; sdp?: unknown } | null;
  if (typeof o !== 'object' || o === null || o.type !== want || typeof o.sdp !== 'string' || o.sdp.length > 20_000) {
    throw new Error(`That is not an ${want} code.`);
  }
  return { type: want, sdp: o.sdp };
}

/**
 * Waits for the offer or answer to hold its candidates (the codes are non-trickle): at gathering complete, or once a STUN
 * candidate arrived and `earlyMs` passed (waiting for the slow servers costs seconds for nothing), but never past `maxMs`.
 */
export function gathered(peer: Peer, maxMs: number, earlyMs = 1000): Promise<void> {
  const pc = peer.pc;
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    const started = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const done = (): void => {
      for (const t of timers) clearTimeout(t);
      resolve();
    };
    timers.push(setTimeout(done, maxMs));
    if (peer.srflx) timers.push(setTimeout(done, earlyMs));
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') done();
    });
    pc.addEventListener('icecandidate', (e) => {
      if (e.candidate === null) { done(); return; }
      // The Peer's own listener (registered first) has already noted a srflx candidate.
      if (peer.srflx) timers.push(setTimeout(done, Math.max(0, earlyMs - (Date.now() - started))));
    });
  });
}

/** Host: create the link and the offer code to send to the friend. Then `peer.accept(answerCode)`. */
export async function hostPeer(iceServers: RTCIceServer[] = DEFAULT_ICE, gatherMs = 4000): Promise<{ peer: Peer; offer: string }> {
  const peer = new Peer(new RTCPeerConnection({ iceServers }));
  await peer.pc.setLocalDescription(await peer.pc.createOffer());
  await gathered(peer, gatherMs);
  return { peer, offer: encodeSignal(peer.pc.localDescription as RTCSessionDescriptionInit) };
}

/** Joiner: take the host's offer code, return the answer code to send back. */
export async function joinPeer(offer: string, iceServers: RTCIceServer[] = DEFAULT_ICE, gatherMs = 4000): Promise<{ peer: Peer; answer: string }> {
  const remote = decodeSignal(offer, 'offer');
  const peer = new Peer(new RTCPeerConnection({ iceServers }));
  await peer.pc.setRemoteDescription(remote);
  await peer.pc.setLocalDescription(await peer.pc.createAnswer());
  await gathered(peer, gatherMs);
  return { peer, answer: encodeSignal(peer.pc.localDescription as RTCSessionDescriptionInit) };
}
