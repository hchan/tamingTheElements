import { describe, expect, it } from 'vitest';
import { KO_COLLAPSE, KO_COLLAPSE_LEGACY, type KoCollapseSpec, koCollapseFor, koCollapseFrames, koCollapseUrl, koParticles } from './ko-collapse';
import { KO_STILL_HEROES } from './ko-still';

describe('ko collapse', () => {
  it('pins the art-director parameters', () => {
    expect(KO_COLLAPSE['fiara']).toMatchObject({ scaleY: 0.5, scaleX: 1, particle: 'ember' });
    expect(KO_COLLAPSE['cyclonius']).toMatchObject({ scaleY: 0.55, scaleX: 1.25, alpha: 0.6, particle: 'dust' });
    for (const h of Object.keys(KO_COLLAPSE)) expect(KO_STILL_HEROES.has(h), h).toBe(false);
  });

  it('wispera, echo and ishimi fall back to the plain loser face (null under every gate)', () => {
    for (const h of ['wispera', 'echo', 'ishimi']) {
      expect(KO_COLLAPSE[h], h).toBeUndefined();
      expect(KO_COLLAPSE_LEGACY.has(h), h).toBe(false);
      for (const [search, dev] of [['', false], ['?ff=roster24', true]] as const) expect(koCollapseFor(h, true, search, dev), h).toBeNull();
    }
  });

  it('pins lavax and morblass (legacy: no flag needed)', () => {
    expect(KO_COLLAPSE['lavax']).toMatchObject({ particle: 'ash', scaleY: 0.6 });
    expect(KO_COLLAPSE['morblass']).toMatchObject({ particle: 'droplet', scaleX: 1.3, scaleY: 0.4, alpha: 0.85, color: '#3f6f80', rest: { particle: 'splat', count: 6 }, shadow: 0.3, floor: 24 });
    for (const h of ['lavax', 'morblass']) {
      expect(KO_COLLAPSE_LEGACY.has(h), h).toBe(true);
      expect(koCollapseFor(h, true, '', false), h).toBe(KO_COLLAPSE[h]);
      expect(koCollapseFor(h, false, '', false), h).toBeNull();
      const f = KO_COLLAPSE[h] as KoCollapseSpec;
      expect(koCollapseFrames(f, true), h).toHaveLength(2);
      expect(koCollapseFrames(f, true)[0]?.['opacity'], h).toBe(f.alpha);
      expect(koParticles(f), h).toHaveLength(f.count);
    }
    expect(koCollapseFrames(KO_COLLAPSE['morblass'] as KoCollapseSpec, false)).toHaveLength(3);
    expect(koCollapseFrames(KO_COLLAPSE['lavax'] as KoCollapseSpec, false)).toHaveLength(2);
  });

  it('pins rokcore (legacy: no flag needed; appended after morblass)', () => {
    expect(Object.keys(KO_COLLAPSE).slice(-1)).toEqual(['rokcore']);
    expect(KO_COLLAPSE['rokcore']).toMatchObject({ particle: 'dust', scaleX: 1.2, scaleY: 0.5, alpha: 1, ms: 1200, count: 12, floor: 22 });
    for (const h of ['rokcore']) {
      const f = KO_COLLAPSE[h] as KoCollapseSpec;
      expect(KO_COLLAPSE_LEGACY.has(h), h).toBe(true);
      expect(koCollapseFor(h, true, '', false), h).toBe(f);
      expect(koCollapseFor(h, false, '', false), h).toBeNull();
      const end = `scale(${String(f.scaleX)}, ${String(f.scaleY)})`;
      expect(koCollapseFrames(f, true).map((k) => k['transform']), h).toEqual([end, end]); // reduced motion: end state, no start frame
      expect(koCollapseFrames(f, false), h).toHaveLength(f.mid ? 3 : 2);
      expect(koParticles(f), h).toHaveLength(f.count);
    }
  });

  it('end frames stay clearly visible (art-director round: no near-zero alpha, shadow on the floor)', () => {
    for (const [h, f] of Object.entries(KO_COLLAPSE)) {
      expect(f.alpha, h).toBeGreaterThanOrEqual(0.55);
      expect(f.scaleY, h).toBeGreaterThanOrEqual(0.2);
    }
    for (const h of ['morblass', 'rokcore']) expect(KO_COLLAPSE[h]?.shadow, h).toBe(0.3);
    expect(koParticles({ particle: 'mote', count: 7, color: '#fff', ms: 1000 }).every((p) => p.size <= 4 && p.dy < 0)).toBe(true);
  });

  it('floor anchors sit the pile on the name label line (round 2); ripple, ring and streak ellipses exist', () => {
    for (const h of ['fiara', 'cyclonius', 'lavax']) expect(KO_COLLAPSE[h]?.floor, h).toBeUndefined();
    expect(KO_COLLAPSE['morblass']?.color).toBe('#3f6f80');
    expect(koParticles({ particle: 'wisp', count: 9, color: '#fff', ms: 1000 })).toHaveLength(9);
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
