import type { ControlPipe, Transport } from '@core/index';
import { controlPipe, inputTransport } from './rtc-channels';
import { BAD_CODE, packSdp, unpackSdp } from './sdp-codec';

/** Public STUN to start (docs/NETCODE.md); a TURN relay is a later, optional item. */
export const DEFAULT_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/** One WebRTC link with the two negotiated channels of docs/NETCODE.md. */
export class Peer {
  readonly input: Transport;
  readonly control: ControlPipe;
  /** Resolves when both channels are open; rejects if the link fails first. */
  readonly open: Promise<void>;

  constructor(
    readonly pc: RTCPeerConnection,
  ) {
    const input = pc.createDataChannel('input', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
    const control = pc.createDataChannel('control', { negotiated: true, id: 1 });
    this.input = inputTransport(input);
    this.control = controlPipe(control);
    this.open = new Promise<void>((resolve, reject) => {
      let n = 0;
      const one = (): void => {
        if (++n === 2) resolve();
      };
      input.addEventListener('open', one);
      control.addEventListener('open', one);
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') reject(new Error(`connection ${pc.connectionState}`));
      });
    });
    // A rejected `open` nobody awaits must not surface as an unhandled rejection.
    this.open.catch(() => undefined);
  }

  /** The host applies the joiner's answer code. */
  async accept(answer: string): Promise<void> {
    await this.pc.setRemoteDescription(decodeSignal(answer, 'answer'));
  }

  close(): void {
    this.pc.close();
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

function gathered(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    const done = (): void => { resolve(); };
    const t = setTimeout(done, timeoutMs);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t);
        done();
      }
    });
  });
}

/** Host: create the link and the offer code to send to the friend. Then `peer.accept(answerCode)`. */
export async function hostPeer(iceServers: RTCIceServer[] = DEFAULT_ICE, gatherMs = 4000): Promise<{ peer: Peer; offer: string }> {
  const peer = new Peer(new RTCPeerConnection({ iceServers }));
  await peer.pc.setLocalDescription(await peer.pc.createOffer());
  await gathered(peer.pc, gatherMs);
  return { peer, offer: encodeSignal(peer.pc.localDescription as RTCSessionDescriptionInit) };
}

/** Joiner: take the host's offer code, return the answer code to send back. */
export async function joinPeer(offer: string, iceServers: RTCIceServer[] = DEFAULT_ICE, gatherMs = 4000): Promise<{ peer: Peer; answer: string }> {
  const remote = decodeSignal(offer, 'offer');
  const peer = new Peer(new RTCPeerConnection({ iceServers }));
  await peer.pc.setRemoteDescription(remote);
  await peer.pc.setLocalDescription(await peer.pc.createAnswer());
  await gathered(peer.pc, gatherMs);
  return { peer, answer: encodeSignal(peer.pc.localDescription as RTCSessionDescriptionInit) };
}
