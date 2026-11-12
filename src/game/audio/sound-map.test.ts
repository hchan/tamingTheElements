import { describe, expect, it } from 'vitest';
import { SimEventKind, type SimEvent } from '@core/index';
import manifest from '../assets/manifest.generated.json';
import { cueFor } from './sound-map';

const ev = (kind: number, extra: Record<string, number> = {}): SimEvent => ({ kind, tick: 1, seq: 0, ...extra }) as SimEvent;

describe('cueFor', () => {
  it('maps each mapped kind to its sfx cue, with the music duck only where intended', () => {
    expect(cueFor(ev(SimEventKind.damage))).toEqual({ id: 'damage', bus: 'sfx', duck: false });
    expect(cueFor(ev(SimEventKind.swapped))).toEqual({ id: 'swap', bus: 'sfx', duck: false });
    expect(cueFor(ev(SimEventKind.captured))).toEqual({ id: 'capture', bus: 'sfx', duck: true });
    expect(cueFor(ev(SimEventKind.captureFailed))).toEqual({ id: 'evilLaugh', bus: 'sfx', duck: true });
    expect(cueFor(ev(SimEventKind.superStarted))).toEqual({ id: 'whoosh', bus: 'sfx', duck: true });
  });

  it('plays victory only for winner 0, otherwise death (loss or draw)', () => {
    expect(cueFor(ev(SimEventKind.matchEnded, { winner: 0 }))).toEqual({ id: 'victory', bus: 'sfx', duck: true });
    expect(cueFor(ev(SimEventKind.matchEnded, { winner: 1 }))?.id).toBe('death');
    expect(cueFor(ev(SimEventKind.matchEnded, { winner: -1 }))?.id).toBe('death');
    expect(cueFor(ev(SimEventKind.matchEnded))?.id).toBe('death');
  });

  it('is silent for unmapped kinds and unknown numbers', () => {
    expect(cueFor(ev(SimEventKind.died))).toBeUndefined();
    expect(cueFor(ev(9999))).toBeUndefined();
  });

  it('only names sounds that exist in the asset manifest, on a known bus', () => {
    const ids = new Set(manifest.sounds.map((s) => s.id));
    for (const k of Object.values(SimEventKind)) {
      for (const winner of [0, 1]) {
        const cue = cueFor(ev(k, { winner }));
        if (cue) {
          expect(ids.has(cue.id)).toBe(true);
          expect(['music', 'sfx', 'ui']).toContain(cue.bus);
        }
      }
    }
  });
});
