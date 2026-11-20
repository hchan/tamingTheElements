import type Phaser from 'phaser';
import type { RenderCharacter, RenderView } from '@core/index';
import { describe, expect, it } from 'vitest';
import { mountStatusRingView, statusRingDrawn, statusRingState } from './status-ring-view';

function chain(depths: number[], destroyed: number[]): Record<string, unknown> {
  const idx = depths.length;
  depths.push(0);
  const self: Record<string, unknown> = new Proxy({}, {
    get: (_t, k: string) => {
      if (k === 'setDepth') return (d: number) => { depths[idx] = d; return self; };
      if (k === 'destroy') return () => { destroyed.push(idx); };
      return () => self;
    },
  });
  return self;
}

function setup(statuses: Record<number, number[]>, flags = 0) {
  const depths: number[] = [];
  const destroyed: number[] = [];
  const handlers = new Map<string, () => void>();
  const scene = {
    add: { graphics: () => chain(depths, destroyed) },
    events: {
      on: (n: string, f: () => void) => { handlers.set(n, f); return scene.events; },
      once: (n: string, f: () => void) => { handlers.set(n, f); return scene.events; },
      off: () => scene.events,
    },
  };
  const view = {
    tick: 200,
    arcade: () => undefined,
    forEachCharacter: (f: (c: RenderCharacter) => void) => {
      for (const id of [0, 1]) f({ id, flags, x: 300 + id * 500, y: 300, w: 80, h: 160, element: 'fire' } as unknown as RenderCharacter);
    },
    forEachStatus: (id: number, f: (s: { id: number; startTick: number; expireTick: number }) => void) => {
      for (const s of statuses[id] ?? []) f({ id: s, startTick: 190, expireTick: 400 });
    },
  } as unknown as RenderView;
  const s = scene as unknown as Phaser.Scene;
  mountStatusRingView(s, view, () => false, () => false);
  return { s, depths, destroyed, draw: () => handlers.get('postupdate')?.(), shut: () => handlers.get('shutdown')?.() };
}

describe('status ring view', () => {
  it('layers back under the hero and front over it, and lists only ring statuses', () => {
    const t = setup({ 0: [1, 2, 3, 5, 8], 1: [6, 7, 9, 10] });
    t.draw();
    expect(t.depths.length).toBe(3);
    expect(t.depths[0]).toBe(-0.2);
    expect(t.depths[1]).toBe(6.15);
    expect(t.depths[2]).toBeCloseTo(6.2);
    const rings = statusRingState(t.s)?.rings ?? [];
    expect(rings.map((r) => r.status).sort((a, b) => a - b)).toEqual([5, 9, 10]);
    expect(rings.filter((r) => r.id === 1).length).toBe(2);
  });

  it('draws nothing for benched or dead heroes', () => {
    for (const flags of [16, 32]) {
      const t = setup({ 0: [5], 1: [10] }, flags);
      t.draw();
      expect(statusRingState(t.s)?.rings).toEqual([]);
    }
  });

  it('tears down on shutdown', () => {
    const t = setup({ 0: [5] });
    t.draw();
    t.shut();
    expect(statusRingState(t.s)).toBeUndefined();
    expect(t.destroyed.length).toBe(t.depths.length);
    expect([...t.destroyed].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('marks only the two stacked statuses as drawn, so a third keeps its body loop', () => {
    const t = setup({ 0: [10, 9, 6] });
    t.draw();
    expect([...(statusRingDrawn(t.s) ?? [])].sort()).toEqual(['0:10', '0:9']);
    expect(statusRingState(t.s)?.rings.map((r) => r.scale)).toEqual([1, 0.8]);
    t.shut();
    expect(statusRingDrawn(t.s)).toBeUndefined();
  });
});
