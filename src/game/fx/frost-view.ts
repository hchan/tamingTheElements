import type Phaser from 'phaser';

/**
 * Water-hit frost burst (QA r23: Ice Shock read as a brown debris puff): eight long pale-blue crystal shards fly out from a white core
 * flash in the first ~0.3 s, and a frost marker (a pale ground ring with small ice ticks, the slow cue) lingers under the victim for
 * ~0.9 s. One pooled Graphics, one update listener that exists only while something plays; `paused` holds it. Renderer-only: callers
 * skip it under reduced motion.
 */
export const FROST_SHARD_MS = 320;
export const FROST_MARK_MS = 900;
export const FROST_POOL = 6;
const SHARDS = 8;
const REACH = 40;
const CORE = 0xffffff;
const ICE = 0xbfeaff;
const ICE_DEEP = 0x4fa8e8;

/** Shard progress 0..1 to its reach share: a fast ease-out so the crystals snap outward. Pure. */
export function frostShardReach(age: number): number {
  const t = Math.min(1, Math.max(0, age / FROST_SHARD_MS));
  return 1 - (1 - t) * (1 - t);
}

/** Alpha 0..1 of the shards and core `age` ms in: solid for the first third, then a fade; 0 once over. Pure. */
export function frostShardAlpha(age: number): number {
  if (age < 0 || age >= FROST_SHARD_MS) return 0;
  const t = age / FROST_SHARD_MS;
  return t < 0.35 ? 1 : 1 - (t - 0.35) / 0.65;
}

/** Alpha 0..1 of the lingering marker `age` ms in: quick rise, a long hold, then a fade; 0 once over. Pure. */
export function frostMarkAlpha(age: number): number {
  if (age < 0 || age >= FROST_MARK_MS) return 0;
  const t = age / FROST_MARK_MS;
  if (t < 0.1) return t / 0.1;
  return t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
}

export interface FrostLayer {
  /** Plays the burst and the marker at (x, y); `footY` is where the victim stands (the marker's centre). */
  burst(x: number, y: number, footY: number): void;
  /** Live bursts (tests). */
  live(): number;
}

export function createFrostLayer(scene: Phaser.Scene, paused: () => boolean): FrostLayer {
  interface Burst {
    x: number;
    y: number;
    footY: number;
    age: number;
    spin: number;
  }
  const bursts: Burst[] = [];
  let gfx: Phaser.GameObjects.Graphics | undefined;
  let attached = false;
  let seq = 0;

  const detach = (): void => {
    if (!attached) return;
    attached = false;
    scene.events.off('update', tick);
    scene.events.off('shutdown', drop);
    scene.events.off('destroy', drop);
  };
  const drop = (): void => {
    bursts.length = 0;
    gfx = undefined;
    detach();
  };
  function draw(): void {
    if (!gfx) return;
    gfx.clear();
    for (const b of bursts) {
      const ma = frostMarkAlpha(b.age);
      if (ma > 0) {
        // Ground marker: a flat pale ring with a darker rim and six ice ticks, readable as "chilled" while it lasts.
        gfx.lineStyle(4, ICE_DEEP, 0.55 * ma).strokeEllipse(b.x, b.footY, 64, 26);
        gfx.lineStyle(2, CORE, 0.9 * ma).strokeEllipse(b.x, b.footY, 60, 22);
        gfx.fillStyle(ICE, 0.22 * ma).fillEllipse(b.x, b.footY, 56, 20);
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          const tx = b.x + Math.round(Math.sign(Math.cos(a)) * (i % 3 === 1 ? 0 : 1)) * 26;
          const ty = b.footY - 12 + ((i * 7) % 3) * 12;
          gfx.fillStyle(CORE, 0.85 * ma).fillTriangle(tx - 3, ty + 4, tx + 3, ty + 4, tx, ty - 6);
        }
      }
      const sa = frostShardAlpha(b.age);
      if (sa > 0) {
        const r = REACH * frostShardReach(b.age);
        gfx.fillStyle(CORE, 0.9 * sa).fillCircle(b.x, b.y, 14 * (1 - 0.4 * frostShardReach(b.age)));
        for (let i = 0; i < SHARDS; i++) {
          // 8 fixed directions (no trig: the table is the compass) turned a little per burst so repeated hits do not stamp one pattern.
          const d = DIRS[(i + b.spin) % 8] ?? [1, 0];
          const len = i % 2 === 0 ? 1 : 0.7;
          const tipX = b.x + d[0] * r * len;
          const tipY = b.y + d[1] * r * len;
          const nx = -d[1] * 4.5;
          const ny = d[0] * 4.5;
          const baseX = b.x + d[0] * r * 0.25;
          const baseY = b.y + d[1] * r * 0.25;
          gfx.fillStyle(ICE_DEEP, sa).fillTriangle(baseX + nx * 1.3, baseY + ny * 1.3, baseX - nx * 1.3, baseY - ny * 1.3, tipX, tipY);
          gfx.fillStyle(i % 2 === 0 ? CORE : ICE, sa).fillTriangle(baseX + nx, baseY + ny, baseX - nx, baseY - ny, tipX, tipY);
        }
      }
    }
  }
  function tick(_time: number, delta: number): void {
    if (paused()) return;
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      if (!b) continue;
      b.age += delta;
      if (b.age >= FROST_MARK_MS) bursts.splice(i, 1);
    }
    draw();
    if (bursts.length === 0) {
      gfx?.clear();
      detach();
    }
  }
  return {
    burst(x, y, footY): void {
      gfx ??= scene.add.graphics().setDepth(11);
      if (bursts.length >= FROST_POOL) bursts.shift();
      bursts.push({ x, y, footY, age: 0, spin: seq++ % 8 });
      draw();
      if (!attached) {
        attached = true;
        scene.events.on('update', tick);
        scene.events.once('shutdown', drop);
        scene.events.once('destroy', drop);
      }
    },
    live: () => bursts.length,
  };
}

const R = 0.7071;
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [R, R],
  [0, 1],
  [-R, R],
  [-1, 0],
  [-R, -R],
  [0, -1],
  [R, -R],
];
