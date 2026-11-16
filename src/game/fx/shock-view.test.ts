import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { POP_RECTS_KEY } from '../hud/arcade-hud';
import { createShockLayer } from './shock-view';

const NUMERIC: Record<string, number> = { x: 0, y: 0, alpha: 1, displayWidth: 60, displayHeight: 40, originX: 0.5, originY: 0.5 };

/** A scene stub with just the text factory, registry, events and scale the gold super number touches. */
function fakeScene(): { scene: Phaser.Scene; reg: Map<string, unknown> } {
  const reg = new Map<string, unknown>();
  const text = (): unknown => {
    const t: Record<string, unknown> = { text: '', visible: true, ...NUMERIC };
    const chain = new Proxy(t, {
      get: (o, k: string) => (k in o ? o[k] : (...a: unknown[]) => {
        if (k === 'setText') o['text'] = a[0];
        if (k === 'setPosition') { o['x'] = a[0]; o['y'] = a[1]; }
        if (k === 'setAlpha') o['alpha'] = a[0];
        if (k === 'setVisible') o['visible'] = a[0];
        return chain;
      }),
    });
    return chain;
  };
  const scene = {
    add: { text },
    registry: {
      get: (k: string) => (k === 'tte.cut' ? false : reg.get(k)),
      set: (k: string, v: unknown) => reg.set(k, v),
      remove: (k: string) => reg.delete(k),
    },
    events: { on: () => undefined, off: () => undefined, once: () => undefined },
    scale: { width: 1280 },
  } as unknown as Phaser.Scene;
  return { scene, reg };
}

describe('gold super number (r19: no ghosted double number)', () => {
  it('merges a second hit landing on the same spot into one number with the summed amount', () => {
    const layer = createShockLayer(fakeScene().scene, () => false);
    layer.superHit(400, 300, 36, 0.1, false, false);
    layer.superHit(404, 296, 300, 0.9, false, false);
    const s = layer.state();
    expect(s.superNumbers).toBe(1);
    expect(s.superNumberTexts).toEqual(['336']);
  });

  it('keeps numbers on different victims apart', () => {
    const layer = createShockLayer(fakeScene().scene, () => false);
    layer.superHit(200, 300, 36, 0.1, false, false);
    layer.superHit(900, 300, 36, 0.1, false, false);
    expect(layer.state().superNumbers).toBe(2);
  });

  it('publishes its live number rects for the HUD to avoid and empties them on shutdown', () => {
    const { scene, reg } = fakeScene();
    const layer = createShockLayer(scene, () => false);
    layer.superHit(400, 300, 36, 0.1, false, false);
    const rects = reg.get(POP_RECTS_KEY) as { w: number; h: number }[];
    expect(rects.length).toBe(1);
    expect(rects[0]?.w).toBeGreaterThan(0);
  });
});
