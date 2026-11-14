import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { createShockLayer } from './shock-view';

/** A scene stub with just the text factory, registry, events and scale the gold super number touches. */
function fakeScene(): Phaser.Scene {
  const text = (): unknown => {
    const t: Record<string, unknown> = { text: '' };
    const chain = new Proxy(t, {
      get: (o, k: string) => (k === 'text' ? o['text'] : (...a: unknown[]) => { if (k === 'setText') o['text'] = a[0]; return chain; }),
    });
    return chain;
  };
  return {
    add: { text },
    registry: { get: () => false },
    events: { on: () => undefined, off: () => undefined, once: () => undefined },
    scale: { width: 1280 },
  } as unknown as Phaser.Scene;
}

describe('gold super number (r19: no ghosted double number)', () => {
  it('merges a second hit landing on the same spot into one number with the summed amount', () => {
    const layer = createShockLayer(fakeScene(), () => false);
    layer.superHit(400, 300, 36, 0.1, false, false);
    layer.superHit(404, 296, 300, 0.9, false, false);
    const s = layer.state();
    expect(s.superNumbers).toBe(1);
    expect(s.superNumberTexts).toEqual(['336']);
  });

  it('keeps numbers on different victims apart', () => {
    const layer = createShockLayer(fakeScene(), () => false);
    layer.superHit(200, 300, 36, 0.1, false, false);
    layer.superHit(900, 300, 36, 0.1, false, false);
    expect(layer.state().superNumbers).toBe(2);
  });
});
