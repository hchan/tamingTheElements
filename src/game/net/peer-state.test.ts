import { afterEach, describe, expect, it, vi } from 'vitest';
import { Peer, failureWords, gathered, hostPeer, type PeerState } from './peer';

/** A fake RTCPeerConnection: just the events and fields Peer and `gathered` use. */
class FakeChannel extends EventTarget {
  binaryType = 'blob';
  readyState = 'connecting';
  send = vi.fn();
  open(): void {
    this.readyState = 'open';
    this.dispatchEvent(new Event('open'));
  }
}

class FakePc extends EventTarget {
  iceGatheringState = 'new';
  connectionState = 'new';
  channels: FakeChannel[] = [];
  localDescription: RTCSessionDescriptionInit | null = null;
  closed = false;
  createDataChannel(): FakeChannel {
    const c = new FakeChannel();
    this.channels.push(c);
    return c;
  }
  createOffer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: 'offer', sdp: 'v=0\r\n' });
  }
  setLocalDescription(d: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = d;
    return Promise.resolve();
  }
  close(): void {
    this.closed = true;
  }
  candidate(type: string | null): void {
    const ev = new Event('icecandidate') as Event & { candidate: unknown };
    ev.candidate = type === null ? null : { type, candidate: `candidate:1 1 udp 1 1.2.3.4 5 typ ${type}` };
    this.dispatchEvent(ev);
  }
  gathering(state: string): void {
    this.iceGatheringState = state;
    this.dispatchEvent(new Event('icegatheringstatechange'));
  }
  connection(state: string): void {
    this.connectionState = state;
    this.dispatchEvent(new Event('connectionstatechange'));
  }
}

const asPeer = (pc: FakePc): Peer => new Peer(pc as unknown as RTCPeerConnection);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('gathering', () => {
  it('resolves as soon as a srflx candidate has arrived and 1 s has passed, not at the 4 s cap', async () => {
    vi.useFakeTimers();
    const pc = new FakePc();
    const peer = asPeer(pc);
    let done = false;
    void gathered(peer, 4000).then(() => { done = true; });
    pc.candidate('host');
    await vi.advanceTimersByTimeAsync(2000);
    expect(done).toBe(false);
    pc.candidate('srflx');
    expect(peer.srflx).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('waits at least 1 s from the start even when srflx arrives at once', async () => {
    vi.useFakeTimers();
    const pc = new FakePc();
    const peer = asPeer(pc);
    let done = false;
    void gathered(peer, 4000).then(() => { done = true; });
    pc.candidate('srflx');
    await vi.advanceTimersByTimeAsync(500);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(done).toBe(true);
  });

  it('resolves at once when gathering completes, and at the cap with no srflx', async () => {
    vi.useFakeTimers();
    const pc = new FakePc();
    let done = false;
    void gathered(asPeer(pc), 4000).then(() => { done = true; });
    pc.gathering('complete');
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);

    const pc2 = new FakePc();
    let done2 = false;
    void gathered(asPeer(pc2), 4000).then(() => { done2 = true; });
    pc2.candidate('host');
    await vi.advanceTimersByTimeAsync(3999);
    expect(done2).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done2).toBe(true);
  });

  it('hostPeer returns the offer once gathering completes', async () => {
    const pc = new FakePc();
    vi.stubGlobal('RTCPeerConnection', function () { return pc; });
    const p = hostPeer([], 4000);
    await Promise.resolve();
    await Promise.resolve();
    pc.gathering('complete');
    const { offer } = await p;
    expect(offer.length).toBeGreaterThan(0);
  });
});

describe('Peer.onState', () => {
  it('reports connected, disconnected, a recovery and then the final failed once, after open', async () => {
    const pc = new FakePc();
    const peer = asPeer(pc);
    const seen: PeerState[] = [];
    peer.onState((s) => seen.push(s));
    for (const c of pc.channels) c.open();
    await peer.open;
    pc.connection('connected');
    pc.connection('disconnected');
    pc.connection('connected');
    pc.connection('failed');
    pc.connection('closed');
    expect(seen).toEqual(['connected', 'disconnected', 'connected', 'failed']);
  });

  it('reports closed on a local close, once, and unsubscribes', async () => {
    const pc = new FakePc();
    const peer = asPeer(pc);
    const seen: PeerState[] = [];
    const off = peer.onState((s) => seen.push(s));
    for (const c of pc.channels) c.open();
    await peer.open;
    peer.close();
    peer.close();
    expect(pc.closed).toBe(true);
    expect(seen).toEqual(['closed']);
    off();
    expect(seen).toHaveLength(1);
  });

  it('reports nothing before open: the failure goes to the open promise, in words about the network', async () => {
    const pc = new FakePc();
    const peer = asPeer(pc);
    const seen: PeerState[] = [];
    peer.onState((s) => seen.push(s));
    pc.connection('failed');
    await expect(peer.open).rejects.toThrow(failureWords(false));
    expect(seen).toEqual([]);
  });

  it('says a relay may help only differently once a public address was found', async () => {
    const pc = new FakePc();
    const peer = asPeer(pc);
    pc.candidate('srflx');
    pc.connection('failed');
    await expect(peer.open).rejects.toThrow(failureWords(true));
    expect(failureWords(true)).not.toBe(failureWords(false));
    expect(failureWords(false)).toMatch(/no public address/);
  });
});
