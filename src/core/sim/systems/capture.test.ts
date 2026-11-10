import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../data/characters';
import { allocEntity } from '../alloc';
import { Cmd } from '../commands';
import { SimEventKind, type SimEvent } from '../events';
import { step } from '../step';
import { EntityFlag, EntityKind, MAX_ENTITIES, World as W } from '../state';
import { createWorld, type SimWorld } from '../world';
import { CAPTURE_GRANTED_BIT } from './capture';
import { capturedIds, matchWinner } from './end';

function scene(opts: { granted?: boolean; hp?: number; targetId?: string } = {}): SimWorld {
  const world = createWorld(1, { x: 0, y: 0, w: 1280, h: 720 });
  const s = world.state;
  if (opts.granted !== false) s.world[W.flags] = (s.world[W.flags] ?? 0) | CAPTURE_GRANTED_BIT;
  const tdef = opts.targetId === undefined ? 0 : CHARACTERS.findIndex((c) => c.id === opts.targetId);
  for (const [team, def, x, hp] of [[0, 0, 100, 1000], [1, tdef, 400, opts.hp ?? 250]] as const) {
    const id = allocEntity(s);
    s.kind[id] = EntityKind.character;
    s.defId[id] = def;
    s.team[id] = team;
    s.owner[id] = id;
    s.dir[id] = team === 0 ? 0 : 4;
    s.x[id] = x;
    s.y[id] = 200;
    s.w[id] = 80;
    s.h[id] = 80;
    s.hp[id] = hp;
    s.maxHp[id] = 1000;
    s.dmgMult[id] = 1;
    s.flags[id] = EntityFlag.alive;
  }
  return world;
}

function run(world: SimWorld, ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...step(world, [i === 0 ? Cmd.capture : 0, 0]));
  return events;
}

const has = (w: SimWorld, id: number, flag: number): boolean => ((w.state.flags[id] ?? 0) & flag) !== 0;

const bullets = (w: SimWorld): number =>
  Array.from({ length: MAX_ENTITIES }, (_, i) => i).filter(
    (i) => w.state.kind[i] === EntityKind.effect && ((w.state.flags[i] ?? 0) & EntityFlag.alive) !== 0,
  ).length;

describe('capture system', () => {
  it('captures a target at 25% health and kills it', () => {
    const w = scene({ hp: 250 });
    const ev = run(w, 120);
    expect(ev.some((e) => e.kind === SimEventKind.captured)).toBe(true);
    expect(((w.state.flags[1] ?? 0) & EntityFlag.captured) !== 0).toBe(true);
    expect(ev.some((e) => e.kind === SimEventKind.died)).toBe(true);
    expect(bullets(w)).toBe(0);
  });

  it('cannot fire above 25% health', () => {
    const w = scene({ hp: 251 });
    run(w, 2);
    expect(bullets(w)).toBe(0);
  });

  it('is not granted in chapter 1', () => {
    const w = scene({ granted: false });
    run(w, 2);
    expect(bullets(w)).toBe(0);
  });

  it('the last boss laughs instead of being captured', () => {
    const w = scene({ targetId: 'eternal-void' });
    const ev = run(w, 120);
    expect(ev.some((e) => e.kind === SimEventKind.captureFailed)).toBe(true);
    expect(ev.some((e) => e.kind === SimEventKind.captured)).toBe(false);
    expect(((w.state.flags[1] ?? 0) & EntityFlag.captured) !== 0).toBe(false);
  });

  it('is on cooldown after firing', () => {
    const w = scene();
    step(w, [Cmd.capture, 0]);
    step(w, [Cmd.capture, 0]);
    expect(bullets(w)).toBe(1);
  });

  // KNOWN-BUG:capture-ignores-fade reproduced for legacy parity: the flag is set, nothing else happens.
  it('a faded target is flagged captured but takes no damage, and the bullet keeps flying (legacy parity)', () => {
    const w = scene();
    const s = w.state;
    s.flags[1] = (s.flags[1] ?? 0) | EntityFlag.translucent;
    s.x[1] = 150;
    const ev = run(w, 4);
    expect(has(w, 1, EntityFlag.captured)).toBe(true);
    expect([s.hp[1], has(w, 1, EntityFlag.dead)]).toEqual([250, false]);
    expect(ev.some((e) => e.kind === SimEventKind.captured || e.kind === SimEventKind.died)).toBe(false);
    expect(bullets(w)).toBe(1);
    expect(matchWinner(s)).toBeNull(); // still in play
    s.hp[1] = 0; // defeated later: it counts as captured
    run(w, 1);
    expect(capturedIds(s, 1)).toEqual([1]);
  });

  it('the boss: the bullet keeps flying and laughs once', () => {
    const w = scene({ targetId: 'eternal-void' });
    w.state.x[1] = 150;
    const ev = run(w, 6);
    expect(ev.filter((e) => e.kind === SimEventKind.captureFailed)).toHaveLength(1);
    expect(bullets(w)).toBe(1);
    expect(w.state.hp[1]).toBe(250);
  });

  // KNOWN-BUG:capture-ignores-fade
  it.fails('capture respects Fade (no captured flag on a faded target)', () => {
    const w = scene();
    w.state.flags[1] = (w.state.flags[1] ?? 0) | EntityFlag.translucent;
    run(w, 120);
    expect(has(w, 1, EntityFlag.captured)).toBe(false);
  });
});
