import { describe, expect, it } from 'vitest';
import { fromHex, goldenFrames } from './conformance-kit';
import { decodeText, encodeText } from './text-codec';

describe('base64 text codec', () => {
  it('round-trips every length 0..300 and matches the golden texts', () => {
    for (let n = 0; n <= 300; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n * 11) & 0xff);
      expect(decodeText(encodeText(b))).toEqual(b);
    }
    for (const g of goldenFrames) {
      expect(encodeText(fromHex(g.hex))).toBe(g.text);
      expect(decodeText(g.text)).toEqual(fromHex(g.hex));
    }
    expect(encodeText(Uint8Array.of(0xfb, 0xff, 0xbf))).toBe('+/+/'); // standard alphabet, not URL-safe
  });
  it('rejects bad alphabet, padding and whitespace', () => {
    for (const bad of ['A', 'AB', 'ABC', 'AB=A', 'A===', '=AAA', 'AA=A', 'AB-_', 'AQEA\n', ' AQE=', 'AQ E=', 'AQ==AQ==', 'é...']) {
      expect(decodeText(bad), bad).toBeUndefined();
    }
    expect(decodeText('')).toEqual(new Uint8Array(0));
  });
});
