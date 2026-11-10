import { describe, expect, it, vi } from 'vitest';
import { SimEventKind } from '@core/index';
import { MUTE_STORAGE_KEY, createArenaAudio, readMuted, unlockOnFirstGesture, type GestureTarget } from './arena-audio';
import type { AudioContextLike } from './audio-manager';

function fakeTarget(): GestureTarget & { fire(type: string): void; count(): number } {
  const map = new Map<string, Set<() => void>>();
  return {
    addEventListener: (t, l) => void (map.get(t) ?? map.set(t, new Set()).get(t))?.add(l),
    removeEventListener: (t, l) => void map.get(t)?.delete(l),
    fire: (t) => {
      for (const l of [...(map.get(t) ?? [])]) l();
    },
    count: () => [...map.values()].reduce((n, s) => n + s.size, 0),
  };
}

function fakeCtx(resume = vi.fn(() => Promise.resolve())): AudioContextLike {
  return {
    state: 'suspended',
    destination: {},
    currentTime: 0,
    resume,
    createGain: () => ({ gain: { value: 1 }, connect: vi.fn() }),
    createBufferSource: () => ({ buffer: null, connect: vi.fn(), start: vi.fn() }),
  };
}

describe('unlockOnFirstGesture', () => {
  it('unlocks once on the first gesture and then removes every listener', () => {
    const target = fakeTarget();
    const unlock = vi.fn();
    unlockOnFirstGesture({ unlock }, target);
    expect(target.count()).toBe(3);
    target.fire('keydown');
    target.fire('pointerdown');
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(target.count()).toBe(0);
  });

  it('the disposer removes the listeners if no gesture ever came, and is idempotent', () => {
    const target = fakeTarget();
    const off = unlockOnFirstGesture({ unlock: vi.fn() }, target);
    off();
    off();
    expect(target.count()).toBe(0);
  });
});

describe('createArenaAudio', () => {
  const store = (initial?: string) => {
    const m = new Map<string, string>(initial === undefined ? [] : [[MUTE_STORAGE_KEY, initial]]);
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it('returns nothing without a Web Audio context', () => {
    expect(createArenaAudio({ ctx: undefined, buffer: () => undefined, gestures: fakeTarget() })).toBeUndefined();
  });

  it('is wired: first gesture resumes the context, Ctrl-M toggles mute and persists it', () => {
    const target = fakeTarget();
    const resume = vi.fn(() => Promise.resolve());
    const ctx = fakeCtx(resume);
    const storage = store();
    const a = createArenaAudio({ ctx, buffer: (id) => (id === 'damage' ? { id } : undefined), gestures: target, storage });
    expect(a).toBeDefined();
    const audio = a?.audio;
    expect(audio?.isUnlocked).toBe(false);
    target.fire('pointerdown');
    expect(audio?.isUnlocked).toBe(true);
    expect(resume).toHaveBeenCalledTimes(1);

    audio?.handleInputEffect({ kind: 'toggleMute' });
    expect(audio?.muted).toBe(true);
    expect(storage.m.get(MUTE_STORAGE_KEY)).toBe('1');
    audio?.handleInputEffect({ kind: 'toggleMute' });
    expect(audio?.muted).toBe(false);
    expect(storage.m.get(MUTE_STORAGE_KEY)).toBe('0');
  });

  it('restores a saved mute choice', () => {
    expect(readMuted(store('1'))).toBe(true);
    expect(readMuted(store())).toBe(false);
    const a = createArenaAudio({ ctx: fakeCtx(), buffer: () => undefined, gestures: fakeTarget(), storage: store('1') });
    expect(a?.audio.muted).toBe(true);
  });

  it('plays a cue only after the first gesture, and not while muted', () => {
    const play = (saved: string): number => {
      const target = fakeTarget();
      const started = vi.fn();
      const ctx = { ...fakeCtx(), createBufferSource: () => ({ buffer: null as unknown, connect: vi.fn(), start: started }) };
      const a = createArenaAudio({ ctx, buffer: (id) => (id === 'damage' ? {} : undefined), gestures: target, storage: store(saved) });
      const ev = { tick: 1, sourceId: 1, kind: SimEventKind.damage, seq: 0 };
      a?.audio.consume([ev]);
      expect(started).not.toHaveBeenCalled();
      target.fire('keydown');
      a?.audio.consume([{ ...ev, seq: 1 }]);
      return started.mock.calls.length;
    };
    expect(play('0')).toBe(1);
    expect(play('1')).toBe(0);
  });
});
