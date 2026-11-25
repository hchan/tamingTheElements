import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { RING_ART, createRingArt, ringPath } from './status-ring-art';
import { ringFrame } from './status-ring';

type Fn = (...a: unknown[]) => void;

const FREEZE = RING_ART[5]?.key ?? '';
const DAZE = RING_ART[10]?.key ?? '';

function fakeScene(preloaded = false) {
  const once = new Map<string, Fn>();
  const on = new Map<string, Fn>();
  const loaded = new Set<string>();
  const queued: string[] = [];
  let starts = 0;
  const scene = {
    textures: { exists: (k: string) => preloaded || loaded.has(k) },
    load: {
      on: (n: string, f: Fn) => { on.set(n, f); },
      off: (n: string) => { on.delete(n); },
      once: (n: string, f: Fn) => { once.set(n, f); },
      image: (k: string, url: string) => { queued.push(`${k}=${url}`); },
      isLoading: () => false,
      start: () => { starts++; },
    },
  };
  return {
    scene: scene as unknown as Phaser.Scene,
    queued,
    starts: () => starts,
    finish: (k: string) => { loaded.add(k); once.get(`filecomplete-image-${k}`)?.(); },
    fail: (k: string) => { on.get('loaderror')?.({ key: k }); },
    handlers: on,
  };
}

describe('ring art path choice', () => {
  it('uses a plate only for a plated status that is ready', () => {
    expect(ringPath(5, 'ready')).toBe('texture');
    expect(ringPath(10, 'ready')).toBe('texture');
    for (const s of ['idle', 'loading', 'error', undefined] as const) expect(ringPath(5, s)).toBe('procedural');
    for (const st of [6, 7, 9]) expect(ringPath(st, 'ready')).toBe('procedural');
  });

  it('loads lazily once, falls back until loaded, then switches to the texture', () => {
    const f = fakeScene();
    const art = createRingArt(f.scene, '/base');
    expect(f.queued).toEqual([]);
    expect(art.path(6)).toBe('procedural');
    expect(f.queued).toEqual([]);
    expect(art.path(5)).toBe('procedural');
    expect(art.path(5)).toBe('procedural');
    expect(f.queued).toEqual([`${FREEZE}=/base/assets/img/fx/status/freeze.png`]);
    expect(f.starts()).toBe(1);
    f.finish(FREEZE);
    expect(art.path(5)).toBe('texture');
  });

  it('stays procedural after a load error and never retries', () => {
    const f = fakeScene();
    const art = createRingArt(f.scene, '/');
    expect(art.path(10)).toBe('procedural');
    f.fail(DAZE);
    expect(art.path(10)).toBe('procedural');
    expect(f.queued.length).toBe(1);
    art.dispose();
    expect(f.handlers.has('loaderror')).toBe(false);
  });

  it('uses an already cached texture at once', () => {
    const art = createRingArt(fakeScene(true).scene, '/');
    expect(art.path(5)).toBe('texture');
  });

  it('a plate ring keeps only the timer arc (no rim, no shapes)', () => {
    const body = { x: 100, y: 100, w: 80, h: 160 };
    const base = { status: 5, element: 'fire', id: 1, body, now: 10, alpha: 1, fraction: 0.5, scale: 1, reduced: false, highContrast: false } as const;
    const full = ringFrame(base as never);
    const plate = ringFrame({ ...base, plate: true } as never);
    expect(plate.segs.length).toBeLessThan(full.segs.length);
    expect(plate.cx).toBe(full.cx);
  });
});
