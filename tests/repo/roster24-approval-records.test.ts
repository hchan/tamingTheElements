import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHOWCASE_HEROES } from '../../src/ui/screens/showcase-data';

const DIR = 'tools/assets/portrait-rig/provenance';
type Rec = { approved?: string; verdict?: string; overall?: number; beats_shipped?: boolean; reviewer?: string };
const read = (f: string): Record<string, Rec> => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as Record<string, Rec>;
const idea = (hero: string): string => readFileSync(`ideas/in-progress/roster24-${hero}.md`, 'utf8');
const R24 = ['vortigal', 'kindrel', 'nykra', 'ouroth', 'brazgor', 'umbrel', 'hyalia', 'quarrak', 'glimmaw', 'zephra', 'abyssor', 'durrok'];

describe('roster24 approval records', () => {
  it('every APPROVE verdict carries overall >= 4, beats_shipped and the art-director', () => {
    for (const f of readdirSync(DIR).filter((n) => n.endsWith('.json'))) {
      for (const [k, r] of Object.entries(read(f))) {
        if (r.verdict !== 'APPROVE') continue;
        expect(r.overall ?? 0, `${f}:${k}`).toBeGreaterThanOrEqual(4);
        expect(r.beats_shipped, `${f}:${k}`).toBe(true);
        expect(r.reviewer, `${f}:${k}`).toBe('art-director');
      }
    }
  });

  it('Durrok base and bake are APPROVE 4.0, and its idea file does not call the base rejected', () => {
    const d = read('durrok-approval.json');
    expect(d['durrok_120651_rg3']?.overall).toBeGreaterThanOrEqual(4);
    expect(d['durrok_p1_bake']?.verdict).toBe('APPROVE');
    expect(idea('durrok')).not.toMatch(/rejected twice|no approved base/);
  });

  it('Hyalia matte is approved, so its idea file does not call the base rejected; the bake is APPROVE 4 (2026-11-24)', () => {
    const h = read('hyalia-approval.json');
    expect(h['hyalia_matte']?.beats_shipped).toBe(true);
    expect(idea('hyalia')).not.toMatch(/rejected twice|no approved base/);
    expect(h['hyalia_p1_bake']?.verdict).toBe('APPROVE');
    expect(h['hyalia_p1_bake']?.overall).toBe(4);
  });
});

describe('hidden roster24 art stays off the menu showcase', () => {
  it('the showcase hero list (menu-showcase.ts loads <sprite>Large.png from it) holds no roster24 hero', () => {
    const sprites = SHOWCASE_HEROES.map((x) => x.sprite);
    for (const id of R24) expect(sprites).not.toContain(id);
  });
});
