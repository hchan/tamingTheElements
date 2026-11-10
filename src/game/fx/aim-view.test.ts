import { describe, expect, it } from 'vitest';
import { EntityFlag, type RenderArcade, type RenderCharacter, type RenderView } from '@core/index';
import type Phaser from 'phaser';
import { AIM_DEPTH, AIM_NAME, AIM_RADIUS_PX, aimPose, mountAimIndicator } from './aim-view';

const box = { x: 500, y: 300, px: 490, py: 300, w: 80, h: 80 };
const D = AIM_RADIUS_PX * Math.SQRT1_2;

describe('aimPose', () => {
  it('puts the arrow AIM_RADIUS_PX from the interpolated centre along the dir8, turned to it', () => {
    const p = { x: 0, y: 0, angle: 0 };
    const at = (dir: number, alpha = 1): [number, number, number] => {
      aimPose(box, dir, alpha, p);
      return [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, p.angle];
    };
    const r = (v: number): number => Math.round(v * 100) / 100;
    expect(at(0)).toEqual([540 + 64, 340, 0]);
    expect(at(1)).toEqual([r(540 + D), r(340 - D), 315]); // north-east: up and right on screen
    expect(at(2)).toEqual([540, 340 - 64, 270]);
    expect(at(4)).toEqual([540 - 64, 340, 180]);
    expect(at(7)).toEqual([r(540 + D), r(340 + D), 45]); // south-east
    expect(at(0, 0)).toEqual([530 + 64, 340, 0]); // alpha 0: the previous tick's position
  });
});

/** A scene stub: one graphics object that records its calls, and a tiny event emitter. */
function fakeScene(): { scene: Phaser.Scene; g: Record<string, unknown>; emit: (e: string) => void; count: () => number } {
  const listeners = new Map<string, Set<() => void>>();
  const g: Record<string, unknown> = { visible: true, x: 0, y: 0, angle: 0, destroyed: false };
  const chain = new Proxy(g, {
    get: (target, key: string) => {
      if (key in target) return target[key];
      if (key === 'setVisible') return (v: boolean) => ((target['visible'] = v), chain);
      if (key === 'setPosition') return (x: number, y: number) => ((target['x'] = x), (target['y'] = y), chain);
      if (key === 'setAngle') return (a: number) => ((target['angle'] = a), chain);
      if (key === 'setName') return (n: string) => ((target['name'] = n), chain);
      if (key === 'setDepth') return (d: number) => ((target['depth'] = d), chain);
      if (key === 'destroy') return () => { target['destroyed'] = true; };
      return () => chain;
    },
  });
  const events = {
    on: (e: string, f: () => void) => {
      const set = listeners.get(e) ?? new Set();
      set.add(f);
      listeners.set(e, set);
      return events;
    },
    once: (e: string, f: () => void) => events.on(e, f),
    off: (e: string, f: () => void) => {
      listeners.get(e)?.delete(f);
      return events;
    },
  };
  const scene = { add: { graphics: () => chain }, events } as unknown as Phaser.Scene;
  const emit = (e: string): void => {
    for (const f of [...(listeners.get(e) ?? [])]) f();
  };
  const count = (): number => [...listeners.values()].reduce((n, s) => n + s.size, 0);
  return { scene, g, emit, count };
}

function fakeView(chars: Partial<RenderCharacter>[], aim: number): RenderView {
  const arcade = { aim: () => aim } as unknown as RenderArcade;
  return {
    forEachCharacter: (visit: (c: RenderCharacter) => void) => {
      for (const c of chars) visit({ id: 0, team: 0, dir: 0, flags: EntityFlag.alive, ...box, ...c } as RenderCharacter);
    },
    arcade: () => arcade,
  } as unknown as RenderView;
}

describe('mountAimIndicator', () => {
  it("follows the player's first character in play after each update, and cleans up on shutdown", () => {
    const { scene, g, emit, count } = fakeScene();
    const benched = { id: 0, flags: EntityFlag.alive | EntityFlag.benched, x: 100 };
    mountAimIndicator(scene, fakeView([{ id: 2, team: 1, x: 900 }, benched, { id: 3 }], 1), () => 1);
    expect([g['name'], g['depth'], g['visible']]).toEqual([AIM_NAME, AIM_DEPTH, false]);
    emit('postupdate');
    expect(g['visible']).toBe(true);
    expect(g['angle']).toBe(315);
    expect(Math.round(g['x'] as number)).toBe(Math.round(540 + D));
    expect(count()).toBe(3);
    emit('shutdown');
    expect(count()).toBe(0);
    expect(g['destroyed']).toBe(true);
  });

  it('hides without a player character in play', () => {
    const { scene, g, emit } = fakeScene();
    mountAimIndicator(scene, fakeView([{ team: 0, flags: EntityFlag.alive | EntityFlag.dead | EntityFlag.benched }], 0), () => 1);
    emit('postupdate');
    expect(g['visible']).toBe(false);
  });
});
