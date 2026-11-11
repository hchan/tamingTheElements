import { describe, expect, it } from 'vitest';
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
