import type Phaser from 'phaser';
import type { RenderCharacter, RenderView } from '@core/index';
import { describe, expect, it } from 'vitest';
import { mountIdleAuraView } from './idle-aura-view';

/** A scene whose Images log every setPosition (the halo is the first image placed: the hero's box centre). */
function recordingScene(log: number[][]): { scene: Phaser.Scene; draw: () => void } {
  const rec = (): Record<string, unknown> => {
    const o: Record<string, unknown> = { frame: { name: '' }, depth: 0 };
    const self: Record<string, unknown> = new Proxy(o, {
      get: (t, k: string) => {
        if (k in t) return t[k];
        if (k === 'setPosition') return (...a: number[]) => { log.push(a); return self; };
        return () => self;
      },
    });
    return self;
  };
  let draw: () => void = () => undefined;
  const scene = {
    add: { image: rec, graphics: rec },
    textures: { exists: () => true },
    events: { on: (_n: string, f: () => void) => { draw = f; return scene.events; }, once: () => scene.events, off: () => scene.events },
  };
  return { scene: scene as unknown as Phaser.Scene, draw: () => { draw(); } };
}

const view = (): RenderView => {
  const hero = { id: 0, team: 0, flags: 0, x: 600, y: 500, px: 560, py: 500, w: 80, h: 160, sprite: 'nobody', element: 'fire', dir: 0 } as unknown as RenderCharacter;
  return {
    tick: 100,
    arcade: () => undefined,
    forEachCharacter: (f: (c: RenderCharacter) => void) => { f(hero); },
    forEachProjectile: () => undefined,
    forEachStatus: () => undefined,
  } as unknown as RenderView;
}

describe('idle aura position fraction', () => {
  const firstAnchor = (alpha: number, pos?: number): number[] | undefined => {
    const log: number[][] = [];
    const f = recordingScene(log);
    if (pos === undefined) mountIdleAuraView(f.scene, view(), () => alpha, () => false, () => false);
    else mountIdleAuraView(f.scene, view(), () => alpha, () => false, () => false, () => pos);
    f.draw();
    return log[0];
  };
  it('keeps the aura anchor on pos while alpha only drives timing', () => {
    const a = firstAnchor(0.2, 1);
    const b = firstAnchor(0.7, 1);
    expect(a).toBeDefined();
    expect(a).toEqual(b);
    expect(firstAnchor(0.5, 0)).not.toEqual(firstAnchor(0.5, 1));
  });
  it('defaults pos to alpha', () => {
    expect(firstAnchor(0.5)).toEqual(firstAnchor(0.5, 0.5));
  });
});
