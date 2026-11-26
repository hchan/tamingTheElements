import { describe, expect, it } from 'vitest';
import { KO_COLLAPSE, KO_COLLAPSE_LEGACY, type KoCollapseSpec, koCollapseFor, koCollapseFrames, koCollapseUrl, koParticles } from './ko-collapse';
import { KO_STILL_HEROES } from './ko-still';

describe('ko collapse', () => {
  it('pins the art-director parameters', () => {
    expect(KO_COLLAPSE['fiara']).toMatchObject({ scaleY: 0.5, scaleX: 1, particle: 'ember' });
    expect(KO_COLLAPSE['cyclonius']).toMatchObject({ scaleY: 0.55, scaleX: 1.25, alpha: 0.6, particle: 'dust' });
    for (const h of Object.keys(KO_COLLAPSE)) expect(KO_STILL_HEROES.has(h), h).toBe(false);
  });

  it('pins wispera, lavax and morblass (legacy: no flag needed)', () => {
    expect(KO_COLLAPSE['wispera']).toMatchObject({ particle: 'spark', scaleY: 0.35 });
    expect(KO_COLLAPSE['lavax']).toMatchObject({ particle: 'ash', scaleY: 0.6 });
    expect(KO_COLLAPSE['morblass']).toMatchObject({ particle: 'droplet', scaleX: 1.5, scaleY: 0.25 });
    for (const h of ['wispera', 'lavax', 'morblass']) {
      expect(KO_COLLAPSE_LEGACY.has(h), h).toBe(true);
      expect(koCollapseFor(h, true, '', false), h).toBe(KO_COLLAPSE[h]);
      expect(koCollapseFor(h, false, '', false), h).toBeNull();
      const f = KO_COLLAPSE[h] as KoCollapseSpec;
      expect(koCollapseFrames(f, true), h).toHaveLength(2);
      expect(koCollapseFrames(f, true)[0]?.['opacity'], h).toBe(f.alpha);
      expect(koParticles(f), h).toHaveLength(f.count);
    }
    expect(koCollapseFrames(KO_COLLAPSE['morblass'] as KoCollapseSpec, false)).toHaveLength(3);
    expect(koCollapseFrames(KO_COLLAPSE['wispera'] as KoCollapseSpec, false)).toHaveLength(3);
    expect(koCollapseFrames(KO_COLLAPSE['lavax'] as KoCollapseSpec, false)).toHaveLength(2);
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
