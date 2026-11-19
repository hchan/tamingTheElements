import { describe, expect, it } from 'vitest';
import { readCssBundle, readMainCss } from './css-source';

const files = (map: Record<string, string>) => (p: string) => {
  const v = map[p];
  if (v === undefined) throw new Error(`missing ${p}`);
  return v;
};

describe('readCssBundle', () => {
  it('inlines relative imports recursively, in order', () => {
    const read = files({
      '/a/main.css': "/* h */\n@import './p/one.css';\n@import './p/two.css';\n.z{}\n",
      '/a/p/one.css': "@import './deep.css';\n.one{}\n",
      '/a/p/deep.css': '.deep{}\n',
      '/a/p/two.css': '.two{}\n',
    });
    expect(readCssBundle('/a/main.css', read)).toBe('/* h */\n.deep{}\n.one{}\n.two{}\n.z{}\n');
  });

  it('throws on a missing file and on a cycle', () => {
    expect(() => readCssBundle('/a/m.css', files({ '/a/m.css': "@import './x.css';\n" }))).toThrow(/missing/);
    const cyc = files({ '/a/m.css': "@import './b.css';\n", '/a/b.css': "@import './m.css';\n" });
    expect(() => readCssBundle('/a/m.css', cyc)).toThrow(/cycle/);
  });

  it('reads the real main.css', () => {
    expect(readMainCss()).toContain('--color-water');
  });
});
