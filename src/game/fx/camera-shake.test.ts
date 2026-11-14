import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { mountShakeScroll } from './camera-shake';

type Fn = () => void;

function fake() {
  const handlers = new Map<string, Fn[]>();
  const fx = {
    isRunning: true,
    _offsetX: 6,
    _offsetY: -4,
    preRender: (): void => {
      throw new Error('matrix hook must be disabled');
    },
  };
  const cam = { scrollX: 100, scrollY: 50, zoom: 2, shakeEffect: fx };
  const add = (e: string, f: Fn): void => {
    handlers.set(e, [...(handlers.get(e) ?? []), f]);
  };
  const scene = { cameras: { main: cam }, events: { on: add, once: add, off: (): void => undefined } } as unknown as Phaser.Scene;
  return { scene, fx, cam, emit: (e: string): void => handlers.get(e)?.forEach((f) => { f(); }) };
}

describe('mountShakeScroll', () => {
  it('disables the matrix hook and shakes the scroll by whole pixels for the render only', () => {
    const { scene, fx, cam, emit } = fake();
    mountShakeScroll(scene);
    expect(() => { fx.preRender(); }).not.toThrow();
    emit('prerender');
    expect(cam.scrollX).toBe(97);
    expect(cam.scrollY).toBe(52);
    emit('postrender');
    expect(cam.scrollX).toBe(100);
    expect(cam.scrollY).toBe(50);
  });

  it('leaves the scroll alone when no shake is running', () => {
    const { scene, fx, cam, emit } = fake();
    fx.isRunning = false;
    mountShakeScroll(scene);
    emit('prerender');
    emit('postrender');
    expect(cam.scrollX).toBe(100);
    expect(cam.scrollY).toBe(50);
  });
});
