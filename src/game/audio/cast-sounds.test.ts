import { describe, expect, it } from 'vitest';
import { ABILITIES_A, ABILITIES_B } from '@core/index';
import legacySounds from '../../../tests/fixtures/legacy/ability-sounds.json';
import type { RenderView } from '@core/index';
import { CastDetector, castSoundFor } from './cast-sounds';

function viewWith(ready: number, sprite = 'fireBlast'): RenderView {
  return {
    actionBar: (team: number) => (team === 0 ? { abilities: [{ sprite, readyTick: ready, cooldownTicks: 30 }] } : undefined),
  } as unknown as RenderView;
}

describe('castSoundFor', () => {
  it('uses the legacy sound of an ability, by alias or by its own name', () => {
    expect(castSoundFor('fireBlast')).toBe('fireBreath');
    expect(castSoundFor('hurricane')).toBe('hurricane');
    expect(castSoundFor('fade')).toBe('fadeOut');
  });
  it('is silent for Capture (it has event cues) and unknown sprites', () => {
    expect(castSoundFor('capture')).toBeUndefined();
    expect(castSoundFor('nope')).toBeUndefined();
  });
});

describe('CastDetector', () => {
  it('stays silent on first sight, plays when the ready tick moves forward, then not while it cools down', () => {
    const d = new CastDetector();
    expect(d.detect(viewWith(0))).toEqual([]);
    expect(d.detect(viewWith(0))).toEqual([]);
    expect(d.detect(viewWith(30))).toEqual(['fireBreath']);
    expect(d.detect(viewWith(30))).toEqual([]);
    expect(d.detect(viewWith(60))).toEqual(['fireBreath']);
  });
});

describe('cast sounds per ability vs legacy abilities.js', () => {
  const legacy = legacySounds.sounds as Record<string, string | null>;
  const sprites = [...new Set([...ABILITIES_A, ...ABILITIES_B].map((a) => a.sprite))];

  it('covers every legacy ability and no more (fixture and data agree on the sprite set)', () => {
    expect(sprites.sort()).toEqual(Object.keys(legacy).sort());
  });

  for (const sprite of Object.keys(legacy)) {
    it(`${sprite} plays its legacy cast sound`, () => {
      const expected = legacy[sprite];
      // Capture's sound is played from its own event cues, not the action-bar watch.
      expect(castSoundFor(sprite)).toBe(sprite === 'capture' ? undefined : (expected ?? undefined));
    });
  }
});
