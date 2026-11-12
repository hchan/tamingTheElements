import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { Cmd, type Command, type RenderActionBar, type RenderView } from '@core/index';
import { ActionBarView, BAR_Y, CAPTURE_NOTICE_TICKS, SLOT_SIDE, slotX, type ScreenBox } from './action-bar';

/** A recording stand-in for a Phaser game object: setters keep state, drawing calls are logged by name. */
interface Fake {
  text: string;
  visible: boolean;
  x: number;
  y: number;
  scaleX: number;
  displayW: number;
  destroyed: boolean;
  calls: string[];
  texture: { key: string };
  frame: { name: string };
  [k: string]: unknown;
}

function fakeObject(): Fake {
  const o: Fake = { text: '', visible: true, x: 0, y: 0, scaleX: 1, displayW: 0, destroyed: false, calls: [], texture: { key: '__DEFAULT' }, frame: { name: '__BASE' } };
  const log = (n: string) => (): Fake => { o.calls.push(n); return o; };
  for (const n of ['setOrigin', 'setDepth', 'fillStyle', 'lineStyle', 'lineBetween', 'fillRect', 'fillRoundedRect', 'strokeRoundedRect', 'strokeRect',
    'fillTriangle', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fillPath']) o[n] = log(n);
  o['clear'] = (): Fake => { o.calls.length = 0; return o; };
  o['setText'] = (t: string): Fake => { o.text = t; return o; };
  o['setVisible'] = (v: boolean): Fake => { o.visible = v; return o; };
  o['setPosition'] = (x: number, y: number): Fake => { o.x = x; o.y = y; return o; };
  o['setScale'] = (s: number): Fake => { o.scaleX = s; return o; };
  o['setDisplaySize'] = (w: number): Fake => { o.displayW = w; return o; };
  o['setTexture'] = (k: string, f: string): Fake => { o.texture = { key: k }; o.frame = { name: f }; return o; };
  o['destroy'] = (): void => { o.destroyed = true; };
  return o;
}

type PointerFn = (p: { x: number; y: number; worldX: number; worldY: number }) => void;

function rig(opts: { bar: RenderActionBar | undefined; styled?: boolean; place?: () => ScreenBox; width?: number; haveTexture?: boolean }) {
  const gfx: Fake[] = [];
  const images: Fake[] = [];
  const texts: Fake[] = [];
  let handler: PointerFn | undefined;
  let offCalled = false;
  const frames = new Map<string, [number, number, number, number]>();
  const state = { bar: opts.bar };
  const scene = {
    scale: { width: opts.width ?? 1280, displaySize: { width: 1280 } },
    cameras: { main: { zoom: 1, scrollX: 0, scrollY: 0, width: 1280, height: 720 } },
    add: {
      graphics: () => { const g = fakeObject(); gfx.push(g); return g; },
      image: () => { const g = fakeObject(); images.push(g); return g; },
      text: (_x: number, _y: number, t: string) => { const g = fakeObject(); g.text = t; texts.push(g); return g; },
    },
    textures: {
      exists: () => opts.haveTexture !== false,
      get: () => ({ has: (n: string) => frames.has(n), add: (n: string, _i: number, ...r: [number, number, number, number]) => { frames.set(n, r); } }),
    },
    input: {
      on: (_e: string, f: PointerFn) => { handler = f; },
      off: (_e: string, f: PointerFn) => { if (f === handler) { offCalled = true; handler = undefined; } },
    },
  } as unknown as Phaser.Scene;
  const emitted: Command[] = [];
  const view = { actionBar: () => state.bar } as unknown as RenderView;
  const v = new ActionBarView(scene, view, (c) => { emitted.push(c); }, 0, undefined, opts.styled ?? false, opts.place);
  return {
    v, gfx, images, texts, emitted, frames, state,
    click: (x: number, y: number, world = { x, y }): void => { handler?.({ x, y, worldX: world.x, worldY: world.y }); },
    hasHandler: (): boolean => handler !== undefined,
    offCalled: (): boolean => offCalled,
  };
}

const bar = (over: Partial<RenderActionBar> = {}): RenderActionBar => ({
  tick: 100,
  abilities: [
    { sprite: 'adrenaline', readyTick: 0, cooldownTicks: 50 },
    { sprite: 'air', readyTick: 125, cooldownTicks: 49 },
  ],
  capture: undefined,
  swaps: [{ sprite: 'curomo', dead: true }],
  swapReadyTick: 100,
  swapCooldownTicks: 250,
  trap: undefined,
  elemental: undefined,
  ...over,
});

const mid = (i: number): { x: number; y: number } => ({ x: slotX(i) + SLOT_SIDE / 2, y: BAR_Y + SLOT_SIDE / 2 });

describe('ActionBarView', () => {
  it('draws one slot per ability and swap with key labels, and shades a cooling or disabled slot', () => {
    const r = rig({ bar: bar() });
    r.v.update();
    expect(r.v.currentSlots.map((s) => s.kind)).toEqual(['ability', 'ability', 'swap']);
    expect(r.texts.map((t) => t.text)).toEqual(['1', '2', '3']);
    const [back, g] = r.gfx;
    // slot 1 is cooling, slot 2 is a dead swap: two shaded polygons; slot 0 is ready.
    expect(g?.calls.filter((c) => c === 'fillPath')).toHaveLength(2);
    expect(g?.calls.filter((c) => c === 'strokeRect')).toHaveLength(3);
    expect(back?.calls).not.toContain('fillRoundedRect');
  });

  it('sizes icons by the manifest frame and registers the frame once', () => {
    const r = rig({ bar: bar() });
    r.v.update();
    r.v.update();
    expect(r.frames.get('icon')).toEqual([0, 0, 52, 53]);
    const first = r.images[0];
    expect(first?.texture.key).toBe('sprite:adrenaline');
    expect(first?.visible).toBe(true);
    expect(first?.displayW).toBeGreaterThan(0);
    expect(first?.displayW).toBeLessThanOrEqual(SLOT_SIDE);
  });

  it('hides an icon whose texture is not loaded, or whose sprite is unknown (trap slot)', () => {
    const none = rig({ bar: bar(), haveTexture: false });
    none.v.update();
    expect(none.images.every((i) => !i.visible)).toBe(true);
    const trap = rig({ bar: bar({ trap: { readyTick: 100, cooldownTicks: 500, count: 1, max: 2 } }) });
    trap.v.update();
    expect(trap.images[3]?.visible).toBe(false);
    expect(trap.texts[3]?.text).toBe('Z\nTrap 1/2');
    expect(trap.gfx[0]?.calls).toContain('fillTriangle');
  });

  it('styled mode paints a panel, rounded frames and an outline per slot', () => {
    const r = rig({ bar: bar(), styled: true });
    r.v.update();
    const [back, g] = r.gfx;
    expect(back?.calls).toContain('fillRect');
    expect(back?.calls.filter((c) => c === 'fillRoundedRect')).toHaveLength(3);
    expect(g?.calls.filter((c) => c === 'strokeRoundedRect')).toHaveLength(3);
    expect(g?.calls).toContain('lineBetween');
  });

  it('a click on a ready slot emits its command; a dead swap and an off-bar click emit nothing', () => {
    const r = rig({ bar: bar() });
    r.v.update();
    r.click(mid(0).x, mid(0).y);
    r.click(mid(1).x, mid(1).y);
    expect(r.emitted).toEqual([Cmd.primary, Cmd.secondary]);
    r.click(mid(2).x, mid(2).y);
    r.click(mid(0).x, 10);
    expect(r.emitted).toHaveLength(2);
  });

  it('with a panned camera the click uses the screen position in logical px, not the world position', () => {
    const r = rig({ bar: bar(), width: 2560, place: () => ({ x: 500, y: 300, scale: 2 }) });
    r.v.update();
    const m = mid(0);
    r.click(m.x * 2, m.y * 2, { x: 9999, y: 9999 });
    expect(r.emitted).toEqual([Cmd.primary]);
  });

  it('applies the screen box to the graphics and labels every update', () => {
    let box: ScreenBox = { x: 10, y: 20, scale: 0.5 };
    const r = rig({ bar: bar(), place: () => box });
    r.v.update();
    expect([r.gfx[1]?.x, r.gfx[1]?.y, r.gfx[1]?.scaleX]).toEqual([10, 20, 0.5]);
    expect(r.texts[0]?.x).toBeCloseTo(10 + (slotX(0) + 2) * 0.5);
    box = { x: 0, y: 0, scale: 1 };
    r.v.update();
    expect(r.gfx[1]?.x).toBe(0);
  });

  it('shows the capture hint during the first 10 s only, then hides it', () => {
    const cap = { sprite: 'air', readyTick: 0, cooldownTicks: 10, capturable: true };
    const r = rig({ bar: bar({ tick: 5, capture: cap }) });
    r.v.update();
    const hint = r.texts[r.texts.length - 1];
    expect(hint?.visible).toBe(true);
    expect(hint?.text).toBe('Capture unlocked! Press C when the enemy is at 25% health');
    r.state.bar = bar({ tick: CAPTURE_NOTICE_TICKS, capture: cap });
    r.v.update();
    expect(hint?.visible).toBe(false);
  });

  it('hides leftover slot objects when the bar shrinks or disappears, and draws nothing without a bar', () => {
    const r = rig({ bar: bar() });
    r.v.update();
    r.state.bar = bar({ abilities: [{ sprite: 'air', readyTick: 0, cooldownTicks: 1 }], swaps: [] });
    r.v.update();
    expect(r.images.map((i) => i.visible)).toEqual([true, false, false]);
    expect(r.texts.map((t) => t.visible)).toEqual([true, false, false]);
    r.state.bar = undefined;
    r.v.update();
    expect(r.v.currentSlots).toEqual([]);
    expect(r.gfx[1]?.calls).toEqual([]);
    r.click(mid(0).x, mid(0).y);
    expect(r.emitted).toEqual([]);
  });

  it('screenSlots maps slots through the camera and destroy releases everything', () => {
    const r = rig({ bar: bar() });
    r.v.update();
    const s = r.v.screenSlots();
    expect(s).toHaveLength(3);
    expect(s[0]).toEqual({ x: slotX(0), y: BAR_Y + 1, size: SLOT_SIDE });
    expect(r.hasHandler()).toBe(true);
    r.v.destroy();
    expect(r.offCalled()).toBe(true);
    expect([...r.gfx, ...r.images, ...r.texts].every((o) => o.destroyed)).toBe(true);
  });
});
