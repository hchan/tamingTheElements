import { describe, expect, it } from 'vitest';
import { parseTurn } from '../platform/turn-setting';
import { DEFAULT_STUN, iceFromSettings } from './ice';

describe('ice config', () => {
  it('defaults to the two public STUN servers', () => {
    expect(iceFromSettings()).toEqual(DEFAULT_STUN.map((urls) => ({ urls })));
    expect(DEFAULT_STUN.join(' ')).toMatch(/google/);
    expect(DEFAULT_STUN.join(' ')).toMatch(/cloudflare/);
  });

  it('adds a user TURN server with its credentials', () => {
    const s = iceFromSettings({ url: 'turn:relay.example.com:3478', username: 'u', credential: 'p' });
    expect(s).toHaveLength(DEFAULT_STUN.length + 1);
    expect(s[s.length - 1]).toEqual({ urls: 'turn:relay.example.com:3478', username: 'u', credential: 'p' });
  });

  it('accepts turns: and an anonymous relay', () => {
    expect(parseTurn({ url: ' turns:relay.example.com:5349 ' })).toEqual({ url: 'turns:relay.example.com:5349' });
  });

  it('ignores junk from a save: wrong types, other schemes, whitespace, oversize', () => {
    for (const bad of [undefined, null, 5, 'turn:x', [], {}, { url: 5 }, { url: 'http://x' }, { url: 'stun:x' }, { url: 'turn:a b' }, { url: 'turn:' + 'x'.repeat(600) }]) {
      expect(parseTurn(bad)).toBeUndefined();
      expect(iceFromSettings(bad)).toHaveLength(DEFAULT_STUN.length);
    }
    expect(parseTurn({ url: 'turn:x', username: 5, credential: 'x'.repeat(600) })).toEqual({ url: 'turn:x' });
  });
});
