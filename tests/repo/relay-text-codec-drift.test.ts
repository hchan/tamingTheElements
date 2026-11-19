import { describe, expect, it } from 'vitest';
import * as client from '../../src/game/net/ws/text-codec';
import * as pkg from '../../src/core/relay/text-codec';

// The relay package and the game client each keep their own copy of the base64 text codec (the client may not import the package,
// docs/RELAY-PACKAGE.md); this test fails if the two behave differently.
describe('text codec: relay package vs client copy', () => {
  it('encode and decode agree for every length 0..300 and for bad input', () => {
    for (let n = 0; n <= 300; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 73 + n * 29) & 0xff);
      const t = pkg.encodeText(b);
      expect(client.encodeText(b)).toBe(t);
      expect(client.decodeText(t)).toEqual(pkg.decodeText(t));
    }
    for (const bad of ['!!!!', 'AAA', 'AA=A', 'A===', 'AAAA\n', ' AAAA', 'AAA=AAAA', 'AAAA=', '\u00e9AAA', '-_-_']) {
      expect(client.decodeText(bad), bad).toBe(pkg.decodeText(bad));
      expect(pkg.decodeText(bad), bad).toBeUndefined();
    }
  });
});
