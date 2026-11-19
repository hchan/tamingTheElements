import { describe, expect, it } from 'vitest';
import { fromHex, goldenFrames } from '../../src/core/relay/conformance-kit';
import { decodeText, encodeText } from '../../src/core/relay/text-codec';

// The relay's hand-written base64 (src/core/relay/text-codec.ts) must equal Node's Buffer, the reference implementation.
describe('relay text codec vs Node Buffer', () => {
  it('matches for every length 0..600 and for the golden frames', () => {
    for (let n = 0; n <= 600; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 131 + n * 17) & 0xff);
      const t = Buffer.from(b).toString('base64');
      expect(encodeText(b)).toBe(t);
      expect(decodeText(t)).toEqual(b);
    }
    for (const g of goldenFrames) expect(g.text).toBe(Buffer.from(fromHex(g.hex)).toString('base64'));
  });
});
