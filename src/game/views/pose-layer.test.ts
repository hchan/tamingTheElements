import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { EntityFlag, SimEventKind, type RenderCharacter, type RenderProjectile, type RenderView, type SimEvent } from '@core/index';
import { FixedStepDriver, STEP_MS } from '../loop/fixed-step-driver';
import { CharacterView } from './character-view';
import { PoseLayer } from './pose-layer';
import { MAX_DT_MS, STRIDE_PX, shortestArc } from './pose-math';

/** A chainable stand-in for the Phaser Image calls the views and the pose layer make. */
class FakeImage {
  x = 0;
  y = 0;
  scaleX = 1;
  scaleY = 1;
  rotation = 0;
  angle = 0;
  alpha = 1;
  depth = 0;
  flipX = false;
  visible = true;
  frame = { name: 'right0' };
  texture = { key: '__DEFAULT' };
  get displayWidth(): number { return this.scaleX * 80; }
  get displayHeight(): number { return this.scaleY * 80; }
  setPosition(x: number, y: number): this { this.x = x; this.y = y; return this; }
  setDisplaySize(w: number, h: number): this { this.scaleX = w / 80; this.scaleY = h / 80; return this; }
  setScale(x: number, y: number): this { this.scaleX = x; this.scaleY = y; return this; }
  setRotation(r: number): this { this.rotation = r; this.angle = (r * 180) / Math.PI; return this; }
  setAngle(a: number): this { this.angle = a; this.rotation = (a * Math.PI) / 180; return this; }
  setAlpha(a: number): this { this.alpha = a; return this; }
  setFlipX(f: boolean): this { this.flipX = f; return this; }
  setFrame(name: string): this { this.frame = { name }; return this; }
  setTexture(key: string, frame?: string): this { this.texture = { key }; if (frame !== undefined) this.frame = { name: frame }; return this; }
  setVisible(v: boolean): this { this.visible = v; return this; }
  setDepth(d: number): this { this.depth = d; return this; }
  setOrigin(): this { return this; }
  setTint(): this { return this; }
  setTintMode(): this { return this; }
  clearTint(): this { return this; }
  setBlendMode(): this { return this; }
  destroyed = false;
  destroy(): void { this.destroyed = true; }
}

interface Rig {
  readonly images: FakeImage[];
  readonly scene: Phaser.Scene;
  readonly shake: { isRunning: boolean; progress: number; intensity: { x: number; y: number; set(x: number, y: number): void } };
}
function rig(): Rig {
  const images: FakeImage[] = [];
  const shake = {
    isRunning: false,
    progress: 0,
    intensity: { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } },
  };
  const scene = {
    add: { image: () => { const i = new FakeImage(); images.push(i); return i; } },
    textures: { get: () => ({ has: () => true, add: () => undefined }) },
    cameras: { main: { shakeEffect: shake } },
  } as unknown as Phaser.Scene;
  return { images, scene, shake };
}

const SPEED = 5;
const char = (over: Partial<RenderCharacter> = {}): RenderCharacter => ({
  id: 1, team: 0, sprite: 'circusOfSlime', dir: 0, flags: 0, x: 100, y: 200, px: 100, py: 200, w: 80, h: 80, hp: 1, maxHp: 1,
  restCap: 1, element: 'fire', ...over,
});

interface Harness {
  readonly layer: PoseLayer;
  readonly cv: CharacterView;
  readonly img: FakeImage;
  readonly c: RenderCharacter;
  readonly sim: { tick: number; frozen: boolean; aim: number; vx: number; vy: number };
  readonly projs: RenderProjectile[];
  readonly shake: Rig['shake'];
  readonly images: FakeImage[];
  /** Renders one frame `ms` after the previous one; returns the interpolated x the base view drew. */
  step(ms: number): number;
  /** Runs the sim to `now` with the driver, then renders. */
  readonly driver: FixedStepDriver;
  readonly now: number;
  readonly projView: Map<number, { image: FakeImage; glow: FakeImage }>;
  consume(events: SimEvent[]): void;
}

function harness(opts: { arcade?: boolean; reduced?: boolean; vx?: number; vy?: number } = {}): Harness {
  const { scene, images, shake } = rig();
  const c = char();
  const projs: RenderProjectile[] = [];
  const projView = new Map<number, { image: FakeImage; glow: FakeImage }>();
  const clock = { t: 0 };
  const sim = { tick: 0, frozen: false, aim: 0, vx: opts.vx ?? SPEED, vy: opts.vy ?? 0 };
  const view = {
    get tick() { return sim.tick; },
    arcade: () => (opts.arcade === true ? { frozen: sim.frozen, aim: () => sim.aim, guarding: () => false } : undefined),
    forEachCharacter: (visit: (c: RenderCharacter) => void) => { visit(c); },
    forEachProjectile: (visit: (p: RenderProjectile) => void) => { projs.forEach(visit); },
  } as unknown as RenderView;
  const cv = new CharacterView(scene);
  const img = cv.image as unknown as FakeImage;
  const layer = new PoseLayer({
    scene,
    view,
    characters: { peek: () => cv },
    projectiles: {
      peek: (id) => {
        let v = projView.get(id);
        if (!v) { v = { image: new FakeImage(), glow: new FakeImage() }; projView.set(id, v); }
        return v as unknown as ReturnType<PoseLayerDepsPeek>;
      },
    },
    reduced: () => opts.reduced === true,
  });
  const driver = new FixedStepDriver({
    tick: () => {
      sim.tick++;
      c.px = c.x;
      c.py = c.y;
      c.x += sim.vx;
      c.y += sim.vy;
    },
    now: () => clock.t,
  });
  const h: Harness = {
    layer, cv, img, c, sim, projs, projView, shake, images, driver,
    get now() { return clock.t; },
    step(ms) {
      const before = clock.t;
      clock.t += ms;
      const alpha = driver.frame(clock.t);
      cv.apply(c, sim.tick, alpha, true);
      const baseX = img.x;
      layer.frame(clock.t, clock.t - before);
      return baseX;
    },
    consume: (events) => { layer.consume(events); },
  };
  return h;
}
type PoseLayerDepsPeek = ConstructorParameters<typeof PoseLayer>[0]['projectiles']['peek'];

const feetX = (img: FakeImage): number => {
  // The feet-centre pivot the layer rotates and scales about, reconstructed from the Image's final transform.
  const dw = img.displayWidth;
  const dh = img.displayHeight;
  return img.x + (dw / 2) * Math.cos(img.rotation) - dh * Math.sin(img.rotation);
};

describe('smooth walking at any refresh rate (fixed-step driver, fake clock)', () => {
  for (const hz of [50, 60, 75, 90, 120, 144, 165]) {
    it(`${String(hz)} Hz: constant-speed walker moves the same distance every render frame, never backwards`, () => {
      const h = harness();
      const frameMs = 1000 / hz;
      const perFrame = (SPEED / STEP_MS) * frameMs;
      const deltas: number[] = [];
      const feet: number[] = [];
      let prev = 0;
      for (let i = 0; i < hz * 4; i++) {
        const baseX = h.step(frameMs);
        if (i > hz / 2) {
          deltas.push(baseX - prev);
          feet.push(feetX(h.img) - (baseX + 40));
        }
        prev = baseX;
      }
      const worst = Math.max(...deltas.map((d) => Math.abs(d - perFrame)));
      expect(Math.min(...deltas)).toBeGreaterThanOrEqual(0);
      expect(worst).toBeLessThan(1);
      const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      const variance = deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / deltas.length;
      expect(variance).toBeLessThan(1e-9);
      // The feet pivot stays on the interpolated box centre (lean and bob move the sprite about it, never off it).
      expect(Math.max(...feet.map(Math.abs))).toBeLessThan(1e-6);
    });
  }

  it('jittery frame times (random 8 to 25 ms) still never step backwards and stay within one tick of the ideal line', () => {
    const h = harness();
    let seed = 12345;
    const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    let prev = h.step(16);
    let t = 16;
    for (let i = 0; i < 600; i++) {
      const dt = 8 + rnd() * 17;
      t += dt;
      const x = h.step(dt);
      expect(x).toBeGreaterThanOrEqual(prev);
      // Interpolation is exact in time: position = 5 px per 20 ms minus the one-tick display lag.
      expect(Math.abs(x - (100 + (SPEED / STEP_MS) * (t - STEP_MS)))).toBeLessThan(1e-6 + SPEED);
      prev = x;
    }
  });

  it('walk frames follow the distance walked: the same frame at the same distance at every rate', () => {
    const atDistance = (hz: number): string[] => {
      const h = harness();
      const frames: string[] = [];
      // Mid-frame distances (15 px into each 30 px stride), so a frame boundary never sits on the sampling point.
      const marks = [15, 45, 75, 105, 135, 165, 195, 225];
      let k = 0;
      for (let i = 0; i < hz * 3 && k < marks.length; i++) {
        h.step(1000 / hz);
        const dist = h.img.x - 100;
        if (dist >= (marks[k] ?? 0) + 5) {
          frames.push(h.img.frame.name);
          k++;
        }
      }
      return frames;
    };
    const base = atDistance(60);
    expect(base.join()).toBe('right0,right1,right2,right3,right0,right1,right2,right3');
    for (const hz of [50, 120, 144]) expect(atDistance(hz).join()).toBe(base.join());
  });

  it('cycles right0..right3 in order with no skipped or repeated-backwards frame', () => {
    for (const hz of [60, 144]) {
      const h = harness();
      const seq: number[] = [];
      for (let i = 0; i < hz * 3; i++) {
        h.step(1000 / hz);
        const n = Number(h.img.frame.name.replace('right', ''));
        if (seq[seq.length - 1] !== n) seq.push(n);
      }
      for (let i = 1; i < seq.length; i++) expect(seq[i]).toBe(((seq[i - 1] ?? 0) + 1) % 4);
      expect(seq.length).toBeGreaterThan(6);
    }
  });

  it('a slower walker (half speed, e.g. a slow effect) cycles half as fast; a dash-speed walker twice as fast', () => {
    const changes = (vx: number): number => {
      const h = harness({ vx });
      let n = 0;
      let last = '';
      for (let i = 0; i < 180; i++) {
        h.step(1000 / 60);
        if (h.img.frame.name !== last) n++;
        last = h.img.frame.name;
      }
      return n;
    };
    const slow = changes(2.5);
    const normal = changes(5);
    const fast = changes(10);
    expect(normal / slow).toBeGreaterThan(1.7);
    expect(normal / slow).toBeLessThan(2.3);
    expect(fast / normal).toBeGreaterThan(1.7);
    expect(fast / normal).toBeLessThan(2.3);
  });

  it('pause and resume: frozen while paused (position, scale, frame), no jump on resume', () => {
    const h = harness({ arcade: true });
    for (let i = 0; i < 90; i++) h.step(1000 / 60);
    h.driver.pause('user');
    const shots: string[] = [];
    let heldX = 0;
    for (let i = 0; i < 60; i++) {
      const x = h.step(1000 / 60);
      if (i === 10) heldX = x;
      if (i >= 10) {
        expect(x).toBe(heldX);
        shots.push(`${String(h.img.x)}|${String(h.img.scaleY)}|${String(h.img.rotation)}|${h.img.frame.name}`);
      }
    }
    expect(new Set(shots).size).toBe(1);
    const clock = h.layer.state.animMs;
    h.driver.resume('user');
    const first = h.step(1000 / 60);
    expect(first - heldX).toBeLessThan(SPEED + 1);
    for (let i = 0; i < 5; i++) h.step(1000 / 60);
    expect(h.layer.state.animMs).toBeGreaterThan(clock);
  });

  it('hit-stop freeze: a held character does not drift, breathe or jitter on its own', () => {
    const h = harness({ arcade: true, vx: 0 });
    for (let i = 0; i < 30; i++) h.step(1000 / 144);
    h.sim.frozen = true;
    const shots: string[] = [];
    for (let i = 0; i < 100; i++) {
      h.step(1000 / 144);
      shots.push(`${String(h.img.x)}|${String(h.img.y)}|${String(h.img.scaleY)}|${String(h.img.rotation)}`);
    }
    expect(new Set(shots.slice(1)).size).toBe(1);
  });

  it('a huge frame time (tab in the background) is capped', () => {
    const h = harness({ vx: 0 });
    h.step(16);
    const before = h.layer.state.animMs;
    h.step(5000);
    expect(h.layer.state.animMs - before).toBeLessThanOrEqual(MAX_DT_MS);
  });

  it('standing: breathes (a tiny scale wave) and shows the standing frame', () => {
    const h = harness({ vx: 0 });
    const scales = new Set<number>();
    for (let i = 0; i < 200; i++) {
      h.step(1000 / 60);
      scales.add(Math.round(h.img.scaleY * 1e6));
      expect(h.img.frame.name).toBe('right0');
    }
    expect(scales.size).toBeGreaterThan(20);
    const ys = [...scales].map((s) => s / 1e6 / 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.03);
  });

  it('reduced motion keeps the walk cycle (information) but drops lean, bob, breathing and squash', () => {
    const h = harness({ reduced: true });
    const frames = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const baseX = h.step(1000 / 60);
      frames.add(h.img.frame.name);
      expect(h.img.rotation).toBe(0);
      expect(h.img.scaleY).toBeCloseTo(1, 9);
      expect(h.img.x).toBe(baseX);
    }
    expect(frames.size).toBe(4);
  });

  it('teleports (tag-in, placement, round reset) move no feet', () => {
    const h = harness({ vx: 0 });
    for (let i = 0; i < 20; i++) h.step(16);
    h.c.px = h.c.x = 700;
    h.step(16);
    expect(h.img.frame.name).toBe('right0');
  });
});

describe('diagonals (8-way aim and movement)', () => {
  it('lean towards the heading and mirror by the aim, with the nearest side reel', () => {
    const cases: [number, number, number, boolean, string][] = [
      // vx, vy, aim, flipX, reel
      [SPEED, -SPEED, 1, false, 'right'],
      [SPEED, SPEED, 7, false, 'right'],
      [-SPEED, -SPEED, 3, true, 'left'],
      [-SPEED, SPEED, 5, true, 'left'],
    ];
    for (const [vx, vy, aim, flip, reel] of cases) {
      const h = harness({ arcade: true, vx, vy });
      h.sim.aim = aim;
      for (let i = 0; i < 60; i++) h.step(16);
      expect(h.img.flipX).toBe(flip);
      expect(h.img.frame.name.startsWith(reel)).toBe(true);
      expect(Math.sign(h.img.rotation)).toBe(Math.sign(vx));
      expect(Math.abs(h.img.rotation * (180 / Math.PI))).toBeGreaterThan(4);
      expect(Math.abs(h.img.rotation * (180 / Math.PI))).toBeLessThan(10);
    }
  });

  it('keeps the walk phase when the direction changes (no frame pop)', () => {
    const h = harness({ arcade: true });
    for (let i = 0; i < 40; i++) h.step(16);
    const before = h.img.frame.name;
    h.sim.vx = 0;
    h.sim.vy = SPEED;
    h.sim.aim = 6;
    // The reel changes (down), the index must be the same position in the cycle: phase is shared.
    h.step(16);
    const idx = (n: string): number => Number(n.replace(/\D/g, ''));
    expect(Math.abs(idx(h.img.frame.name) - idx(before)) % 4).toBeLessThanOrEqual(1);
  });

  it('starts and stops with a short squash instead of snapping', () => {
    const h = harness({ vx: 0 });
    for (let i = 0; i < 30; i++) h.step(16);
    h.sim.vx = SPEED;
    const sy: number[] = [];
    for (let i = 0; i < 12; i++) { h.step(16); sy.push(h.img.scaleY); }
    expect(Math.min(...sy)).toBeLessThan(0.97);
    expect(Math.min(...sy)).toBeGreaterThan(0.9);
  });
});

describe('Arcade poses from events', () => {
  const ev = (kind: number, seq: number, extra: Record<string, number> = {}): SimEvent =>
    ({ tick: 1, sourceId: 1, kind, seq, ...extra }) as unknown as SimEvent;
  const peakRotation = (h: Harness, frames: number): number => {
    let peak = 0;
    for (let i = 0; i < frames; i++) {
      h.step(16);
      peak = Math.max(peak, Math.abs(h.img.rotation));
    }
    return peak;
  };

  it('a hit tilts the victim back and returns to rest; Classic has no poses', () => {
    const arc = harness({ arcade: true, vx: 0 });
    for (let i = 0; i < 30; i++) arc.step(16);
    arc.consume([ev(SimEventKind.hitConfirmed, 0, { target: 1, attacker: 0, strength: 3 })]);
    expect(peakRotation(arc, 12)).toBeGreaterThan(0.1);
    for (let i = 0; i < 60; i++) arc.step(16);
    expect(Math.abs(arc.img.rotation)).toBeLessThan(0.01);

    const classic = harness({ vx: 0 });
    for (let i = 0; i < 30; i++) classic.step(16);
    classic.consume([ev(SimEventKind.hitConfirmed, 0, { target: 1, attacker: 0, strength: 3 })]);
    expect(peakRotation(classic, 12)).toBe(0);
  });

  it('poses hold during a hit-stop and play on after it', () => {
    const h = harness({ arcade: true, vx: 0 });
    for (let i = 0; i < 30; i++) h.step(16);
    h.consume([ev(SimEventKind.hitConfirmed, 0, { target: 1, attacker: 0, strength: 2 })]);
    h.step(16);
    h.sim.frozen = true;
    const held = new Set<number>();
    for (let i = 0; i < 40; i++) { h.step(16); held.add(h.img.rotation); }
    expect(held.size).toBe(1);
    h.sim.frozen = false;
    h.step(16);
    h.step(16);
    expect(held.has(h.img.rotation)).toBe(false);
  });

  it('a cast (a projectile first seen at the caster) squashes and stretches the caster', () => {
    const h = harness({ arcade: true, vx: 0 });
    for (let i = 0; i < 30; i++) h.step(16);
    h.projs.push({ id: 5, team: 0, sprite: 'fireball', dir: 0, x: 120, y: 220, px: 120, py: 220, w: 20, h: 20 });
    const sy: number[] = [];
    for (let i = 0; i < 20; i++) { h.step(16); sy.push(h.img.scaleY); }
    expect(Math.min(...sy)).toBeLessThan(0.96);
    expect(Math.max(...sy)).toBeGreaterThan(1.03);
  });

  it('KO: a ghost copy falls over and is freed; tag-in slides; victory hops only for the winner', () => {
    const h = harness({ arcade: true, vx: 0 });
    for (let i = 0; i < 10; i++) h.step(16);
    h.consume([ev(SimEventKind.died, 0, { team: 0 })]);
    h.c.flags = EntityFlag.dead;
    h.step(16);
    expect(h.layer.state.ghosts).toBe(1);
    const ghost = h.images[1];
    expect(ghost?.visible).toBe(true);
    for (let i = 0; i < 20; i++) h.step(16);
    expect(Math.abs(ghost?.rotation ?? 0)).toBeGreaterThan(0.3);
    for (let i = 0; i < 60; i++) h.step(16);
    expect(h.layer.state.ghosts).toBe(0);
    expect(ghost?.visible).toBe(false);

    const w = harness({ arcade: true, vx: 0 });
    for (let i = 0; i < 10; i++) w.step(16);
    w.consume([ev(SimEventKind.roundEnded, 0, { winner: 0 })]);
    const ys = new Set<number>();
    for (let i = 0; i < 20; i++) { w.step(16); ys.add(Math.round(w.img.y)); }
    expect(Math.min(...ys)).toBeLessThan(w.c.y - 8);
    const l = harness({ arcade: true, vx: 0 });
    for (let i = 0; i < 10; i++) l.step(16);
    l.consume([ev(SimEventKind.roundEnded, 0, { winner: 1 })]);
    for (let i = 0; i < 20; i++) { l.step(16); expect(l.img.y).toBeGreaterThan(l.c.y - 3); }
  });

  it('reduced motion: poses move nothing; the tag-in still fades in', () => {
    const h = harness({ arcade: true, vx: 0, reduced: true });
    for (let i = 0; i < 30; i++) h.step(16);
    h.consume([ev(SimEventKind.hitConfirmed, 0, { target: 1, attacker: 0, strength: 3 })]);
    expect(peakRotation(h, 12)).toBe(0);
    h.consume([ev(SimEventKind.tagIn, 0, { to: 1, team: 0 })]);
    h.step(16);
    expect(h.img.alpha).toBeLessThan(1);
    expect(h.img.x).toBe(h.c.x);
  });
});

describe('projectiles and shake', () => {
  const proj = (over: Partial<RenderProjectile> = {}): RenderProjectile => ({
    id: 7, team: 0, sprite: 'fireball', dir: 0, x: 300, y: 300, px: 295, py: 300, w: 20, h: 20, ...over,
  });

  it('spawn eases in (scale and alpha) over a few frames, then holds full size', () => {
    const h = harness({ vx: 0 });
    h.step(16);
    h.projs.push(proj());
    const grow: number[] = [];
    const alpha: number[] = [];
    for (let i = 0; i < 8; i++) {
      for (const v of h.projView.values()) { v.image.setScale(1, 1).setAlpha(1); v.glow.setScale(1, 1).setAlpha(1); }
      h.step(16);
      const v = h.projView.get(7);
      grow.push(v?.image.scaleX ?? 0);
      alpha.push(v?.image.alpha ?? 0);
    }
    // The fake base never sets a size, so scale 1 times the ease: it rises from about 0.6 to exactly 1.
    expect(grow[0]).toBeLessThan(0.9);
    expect(grow[0]).toBeGreaterThan(0.55);
    for (let i = 1; i < grow.length; i++) expect(grow[i]).toBeGreaterThanOrEqual(grow[i - 1] ?? 0);
    expect(grow[7]).toBe(1);
    expect(alpha[0]).toBeLessThan(0.9);
    expect(alpha[7]).toBe(1);
  });

  it('rotates by the shortest arc towards a changed heading and never spins the long way', () => {
    const h = harness({ vx: 0 });
    const v = { image: new FakeImage(), glow: new FakeImage() };
    h.projView.set(7, v);
    v.image.setAngle(315);
    h.projs.push(proj());
    h.step(16);
    // The projectile view sets the target angle every frame; north-east is 315 degrees, east 0.
    const angles: number[] = [];
    for (let i = 0; i < 40; i++) {
      v.image.setAngle(i < 5 ? 315 : 0);
      h.step(16);
      angles.push(v.image.angle);
    }
    for (let i = 1; i < angles.length; i++) expect(Math.abs((angles[i] ?? 0) - (angles[i - 1] ?? 0))).toBeLessThan(45);
    expect(Math.max(...angles.slice(5))).toBeLessThanOrEqual(360);
    expect(Math.min(...angles.slice(5))).toBeGreaterThanOrEqual(315);
    expect(Math.abs(shortestArc(angles[39] ?? 0, 0))).toBeLessThan(2);
    expect(v.glow.angle).toBe(v.image.angle);
  });

  it('a projectile that ends leaves a fading ghost that is freed', () => {
    const h = harness({ vx: 0 });
    h.projs.push(proj());
    for (let i = 0; i < 5; i++) h.step(16);
    h.projs.length = 0;
    h.step(16);
    expect(h.layer.state.ghosts).toBe(1);
    for (let i = 0; i < 20; i++) h.step(16);
    expect(h.layer.state.ghosts).toBe(0);
  });

  it('camera shake decays smoothly and the base strength is restored for the next shake', () => {
    const h = harness({ vx: 0 });
    h.shake.isRunning = true;
    h.shake.intensity.x = 0.01;
    h.shake.intensity.y = 0.01;
    const xs: number[] = [];
    for (let p = 0; p <= 10; p++) {
      h.shake.progress = p / 10;
      h.step(16);
      xs.push(h.shake.intensity.x);
    }
    expect(xs[0]).toBeCloseTo(0.01, 9);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeLessThan(xs[i - 1] ?? 0);
    expect(xs[10]).toBeCloseTo(0, 9);
    h.shake.isRunning = false;
    h.step(16);
    h.shake.isRunning = true;
    h.shake.intensity.x = 0.004;
    h.shake.progress = 0;
    h.step(16);
    expect(h.shake.intensity.x).toBeCloseTo(0.004, 9);
  });

  it('destroy frees every ghost image (no leaks on teardown)', () => {
    const h = harness({ arcade: true, vx: 0 });
    h.projs.push(proj());
    for (let i = 0; i < 3; i++) h.step(16);
    h.projs.length = 0;
    h.step(16);
    const made = h.images.slice(1);
    expect(made.length).toBeGreaterThan(0);
    h.layer.destroy();
    expect(made.every((i) => i.destroyed)).toBe(true);
  });
});

describe('stride constant', () => {
  it('is exported for the docs and the tests', () => {
    expect(STRIDE_PX).toBe(30);
  });
});
