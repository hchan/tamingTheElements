import { describe, expect, it } from 'vitest';
import { maskRude, rot13 } from './chat-filter';

// The rude words are written ROT13 here too, so grep output stays clean.
const W = (s: string): string => rot13(s);

describe('chat-filter', () => {
  it('rot13 is its own inverse', () => {
    expect(rot13(rot13('Hello, World 123'))).toBe('Hello, World 123');
  });

  it('masks a hit with the same number of asterisks and keeps the rest', () => {
    const w = W('shpx');
    expect(maskRude(`oh ${w} you`)).toBe('oh **** you');
    expect(maskRude(`${w.toUpperCase()}!`)).toBe('****!');
  });

  it('catches leet and look-alike letters, 1:1', () => {
    expect(maskRude(W('fuvg').replace('i', '1'))).toBe('****');
    expect(maskRude(W('ovgpu').replace('i', '1').replace('t', '7'))).toBe('*****');
    expect(maskRude(W('pbpx').replace('o', 'о'))).toBe('****');
    expect(maskRude(W('qvpx').replace('i', '1'))).toBe('****');
  });

  it('does not hit inside a longer word', () => {
    expect(maskRude('classic assassin cockpit Scunthorpe')).toBe('classic assassin cockpit Scunthorpe');
    expect(maskRude('hello grass')).toBe('hello grass');
  });

  it('allows a plural s and keeps astral characters aligned', () => {
    const w = W('qvpx');
    expect(maskRude(`${w}s`)).toBe('*****');
    expect(maskRude(`\u{1F600} ${w}`)).toBe('\u{1F600} ****');
  });

  it('leaves clean text and empty text alone', () => {
    expect(maskRude('')).toBe('');
    expect(maskRude('good fight, well played')).toBe('good fight, well played');
  });
});
