import { describe, expect, it, vi } from 'vitest';
import { SimEventKind, type SimEvent } from '@core/index';
import { AudioManager, DUCK_GAIN, DUCK_MS, type AudioContextLike, type GainLike } from './audio-manager';
import { cueFor } from './sound-map';
import manifest from '../assets/manifest.generated.json';

function fakeCtx(state = 'suspended') {
  const started: unknown[] = [];
  const gains: GainLike[] = [];
  const resume = vi.fn(() => Promise.resolve());
  const ctx = {
    state,
    destination: {},
    currentTime: 0,
    resume,
    createGain: () => {
      const g = { gain: { value: 1 }, connect: vi.fn() };
      gains.push(g);
      return g;
    },
    createBufferSource: () => ({
      buffer: null as unknown,
      connect: vi.fn(),
      start() {
        started.push(this.buffer);
      },
    }),
  };
  return { ctx: ctx as AudioContextLike & { currentTime: number }, started, gains, resume };
}

const ev = (kind: SimEvent['kind'], seq = 0, tick = 1): SimEvent => ({ tick, sourceId: 1, kind, seq });
const buffers = new Map<string, unknown>(['damage', 'death', 'swap'].map((id) => [id, id]));

describe('sound map', () => {
  it('only maps to ids present in the manifest', () => {
    const ids = new Set(manifest.sounds.map((s) => s.id));
    for (const k of Object.values(SimEventKind)) {
      const cue = cueFor(ev(k));
      if (cue) expect(ids.has(cue.id)).toBe(true);
    }
  });
});

describe('legacy sound cues', () => {
  const withWinner = (winner: number): SimEvent => ({ ...ev(SimEventKind.matchEnded), winner });
  it('plays victory only for a player win, death for a defeat or draw, and nothing for a single death', () => {
    expect([cueFor(withWinner(0))?.id, cueFor(withWinner(1))?.id, cueFor(withWinner(-1))?.id]).toEqual(['victory', 'death', 'death']);
    expect(cueFor(ev(SimEventKind.died))).toBeUndefined();
    expect(cueFor(ev(SimEventKind.captureFailed))?.id).toBe('evilLaugh');
  });
});

describe('AudioManager', () => {
  it('resumes once on first gesture and stays silent before it', () => {
    const { ctx, started, resume } = fakeCtx();
    const a = new AudioManager({ ctx, buffers });
    a.consume([ev(SimEventKind.damage, 0)]);
    expect(started).toHaveLength(0);
    a.unlock();
    a.unlock();
    expect(resume).toHaveBeenCalledTimes(1);
    a.consume([ev(SimEventKind.damage, 1)]);
    expect(started).toEqual(['damage']);
  });

  it('dedupes by event id', () => {
    const { ctx, started } = fakeCtx('running');
    const a = new AudioManager({ ctx, buffers });
    a.unlock();
    a.consume([ev(SimEventKind.damage)]);
    a.consume([ev(SimEventKind.damage)]);
    a.consume([ev(SimEventKind.damage, 1)]);
    expect(started).toHaveLength(2);
  });

  it('toggles mute via the input effect and reports it', () => {
    const { ctx, started, gains } = fakeCtx('running');
    const onMuteChange = vi.fn();
    const a = new AudioManager({ ctx, buffers, onMuteChange });
    a.unlock();
    a.handleInputEffect({ kind: 'toggleMute' });
    expect(a.muted).toBe(true);
    expect(gains[0]?.gain.value).toBe(0);
    a.consume([ev(SimEventKind.damage)]);
    expect(started).toHaveLength(0);
    a.handleInputEffect({ kind: 'toggleMute' });
    expect(gains[0]?.gain.value).toBe(1);
    expect(onMuteChange.mock.calls).toEqual([[true], [false]]);
  });

  it('ducks music on big cues then restores', () => {
    const { ctx, gains } = fakeCtx('running');
    const a = new AudioManager({ ctx, buffers });
    a.unlock();
    a.consume([{ ...ev(SimEventKind.matchEnded), winner: 1 }]);
    expect(gains[1]?.gain.value).toBe(DUCK_GAIN);
    ctx.currentTime = DUCK_MS / 1000 + 0.1;
    a.updateDuck();
    expect(gains[1]?.gain.value).toBe(1);
  });
});
