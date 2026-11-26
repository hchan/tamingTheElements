import { describe, expect, it } from 'vitest';
import { KO_COLLAPSE, type KoCollapseSpec, koCollapseFor, koCollapseFrames, koCollapseUrl, koParticles } from './ko-collapse';
import { KO_STILL_HEROES } from './ko-still';

describe('ko collapse', () => {
  it('pins the art-director parameters', () => {
    expect(KO_COLLAPSE['fiara']).toMatchObject({ scaleY: 0.5, scaleX: 1, particle: 'ember' });
    expect(KO_COLLAPSE['cyclonius']).toMatchObject({ scaleY: 0.55, scaleX: 1.25, alpha: 0.6, particle: 'dust' });
    for (const h of Object.keys(KO_COLLAPSE)) expect(KO_STILL_HEROES.has(h), h).toBe(false);
  });

  it('needs a loss and an eligible hero', () => {
    expect(koCollapseFor('fiara', true, '', false)).toBe(KO_COLLAPSE['fiara']);
    expect(koCollapseFor('cyclonius', true, '?ff=roster24', true)).toBe(KO_COLLAPSE['cyclonius']);
    expect(koCollapseFor('fiara', false, '', false)).toBeNull();
    expect(koCollapseFor('umbrel', true, '?ff=roster24', true)).toBeNull();
    expect(koCollapseUrl('/g', 'fiara')).toBe('/g/assets/img/map/fiaraLarge.png');
  });

  it('collapses at the base; reduced motion has no start frame', () => {
    const f = KO_COLLAPSE['cyclonius'] as KoCollapseSpec;
    const frames = koCollapseFrames(f, false);
    expect(frames[0]?.['transform']).toBe('scale(1, 1)');
    expect(frames[1]?.['transform']).toBe('scale(1.25, 0.55)');
    expect(koCollapseFrames(f, true)[0]?.['transform']).toBe('scale(1.25, 0.55)');
  });

  it('lays out the particles deterministically', () => {
    const f = KO_COLLAPSE['fiara'] as KoCollapseSpec;
    expect(koParticles(f)).toEqual(koParticles(f));
    expect(koParticles(f)).toHaveLength(f.count);
    expect(koParticles(f).every((p) => p.dy < 0)).toBe(true);
  });
});
