import { describe, expect, it } from 'vitest';
import type { ControlPipe } from '@core/index';
import { ControlMux, MSG_BYE } from './control-mux';

function fakePipe(inbox: Uint8Array[], sent: Uint8Array[]): ControlPipe {
  return { send: (m) => void sent.push(m), receive: () => inbox.shift() };
}

describe('ControlMux', () => {
  it('passes handshake and pick messages through in order', () => {
    const inbox = [Uint8Array.of(10, 1), Uint8Array.of(1, 2)];
    const mux = new ControlMux(fakePipe(inbox, []), () => undefined);
    expect([...(mux.pipe.receive() ?? [])]).toEqual([10, 1]);
    expect([...(mux.pipe.receive() ?? [])]).toEqual([1, 2]);
    expect(mux.pipe.receive()).toBeUndefined();
  });

  it('handles BYE on pump even when nobody reads, once, and drops what follows', () => {
    const inbox: Uint8Array[] = [];
    let byes = 0;
    const mux = new ControlMux(fakePipe(inbox, []), () => { byes++; });
    inbox.push(Uint8Array.of(MSG_BYE), Uint8Array.of(MSG_BYE), Uint8Array.of(10));
    mux.pump();
    expect(byes).toBe(1);
    expect(mux.friendLeft).toBe(true);
    expect(mux.pipe.receive()).toBeUndefined();
  });

  it('sendBye sends one BYE, and pipe.send goes straight to the channel', () => {
    const sent: Uint8Array[] = [];
    const mux = new ControlMux(fakePipe([], sent), () => undefined);
    mux.pipe.send(Uint8Array.of(5));
    mux.sendBye();
    mux.sendBye();
    expect(sent.map((m) => [...m])).toEqual([[5], [MSG_BYE]]);
  });
});
