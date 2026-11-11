import { describe, expect, it } from 'vitest';
import { decodeSignal, encodeSignal } from './peer';

describe('signalling codes', () => {
  it('round-trips and checks the kind', () => {
    const code = encodeSignal({ type: 'offer', sdp: 'v=0\r\n' });
    expect(decodeSignal(code, 'offer')).toEqual({ type: 'offer', sdp: 'v=0\r\n' });
    expect(() => decodeSignal(code, 'answer')).toThrow(/answer/);
  });

  it('rejects junk without anything but a plain Error', () => {
    for (const bad of ['', 'not base64!!', btoa('null'), btoa('{"type":"offer"}'), btoa(JSON.stringify({ type: 'offer', sdp: 'x'.repeat(30_000) }))]) {
      expect(() => decodeSignal(bad, 'offer')).toThrow(Error);
    }
  });
});
