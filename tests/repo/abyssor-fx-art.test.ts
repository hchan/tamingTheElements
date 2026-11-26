import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEROES, verify } from '../../tools/assets/integrate-roster24-fx-art';

const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('Abyssor tentacleLash and abyssalPull cast sprites (tools/assets/integrate-roster24-fx-art.ts)', () => {
  it('the committed approval and source verify, and the shipped fx file is the approved one', () => {
    const h = HEROES.abyssor;
    expect(h).toBeDefined();
    if (!h) return;
    expect(verify('abyssor')).toEqual(['tentacleLash', 'abyssalPull']);
    for (const [name, pin] of Object.entries(h.fx)) {
      expect(sha(`public/assets/img/${pin.dst ?? `fx/${name}.png`}`), name).toBe(pin.sha256);
      expect(sha(`${h.provenance}/${pin.src}`), name).toBe(pin.sha256);
    }
  });

  it('abyssalPull is one shared file: only the abyssal-pull ability loads it, and the approval names it by bare file name', () => {
    const h = HEROES.abyssor;
    expect(h?.fx.abyssalPull?.src).toBe('abyssalPull.png');
    const approval = JSON.parse(readFileSync(`${h?.provenance ?? ''}/approval-fx6.json`, 'utf8')) as { approved: string; reviewer: string; beats_shipped: boolean };
    expect(approval).toMatchObject({ reviewer: 'art-director', beats_shipped: true });
    expect(approval.approved.endsWith('abyssalPull.png')).toBe(true);
    const abilities = readFileSync('src/core/data/abilities-c.ts', 'utf8');
    expect(abilities.match(/sprite: 'abyssalPull'/g)).toHaveLength(1);
  });
});
