import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CraftyEntity } from '@testing/legacy/crafty-stub';
import { loadLegacy, type LegacyEnv } from '@testing/legacy/load-legacy';

const FIXTURE = resolve(import.meta.dirname, '../fixtures/legacy/abilities-range.json');
const UPDATE = process.env['TTE_UPDATE_FIXTURES'] === '1';
const SEED = 7;
const DIRECTIONS = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];

type Dict = Record<string, unknown>;
type Fn = (...args: unknown[]) => unknown;

/** Float64 bits as hex, so exact values survive JSON. */
function bits(n: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, n);
  return view.getBigUint64(0).toString(16).padStart(16, '0');
}

/** Numbers are stored as value plus Float64 bits; Number.MAX_VALUE and friends round-trip. */
const num = (n: unknown): unknown => (typeof n === 'number' ? { v: n, bits: bits(n) } : n);

interface Scene {
  env: LegacyEnv;
  attacker: CraftyEntity;
  target: CraftyEntity;
  info: { curCount: number; lastUsed: number };
  defaults: Dict;
  bullets: () => CraftyEntity[];
}

type Abilities = Record<string, { component: { defaults: Dict } }>;

/** Attacker (PlayerCharacter stand-in facing `direction`) and a target (EnemyCharacter stand-in). */
function scene(name: string, direction = 'e'): Scene {
  const env = loadLegacy({ seed: SEED });
  const { crafty } = env;
  const defaults = (env.globals.GameHelper['abilities'] as Abilities)[name]?.component
    .defaults as Dict;
  const attacker = crafty.e('Character');
  const target = crafty.e('Character');
  const info = { curCount: 0, lastUsed: 0 };
  attacker.attr({
    x: 100, y: 200, w: 80, h: 80, direction, targetPlayerType: 'EnemyCharacter',
    elementalType: 'fire', targetPlayer: target, abilitiesInfo: { [name]: info },
  });
  target.attr({
    x: 400, y: 200, w: 80, h: 80, elementalType: 'fire', targetPlayer: attacker,
    topHUD: { buffs: {} },
  });
  target.__c['EnemyCharacter'] = true;
  const bullets = (): CraftyEntity[] =>
    [...crafty.entities.values()].filter((e) => e.has(name) && !e.destroyed);
  return { env, attacker, target, info, defaults, bullets };
}

const canFire = (s: Scene, name: string): boolean =>
  (s.attacker['canFire'] as Fn).call(s.attacker, name) as boolean;

function fire(s: Scene, name: string): void {
  const bullet = s.env.crafty.e(name);
  (bullet['initAbility'] as Fn).call(bullet, s.attacker);
}

function snapshot(b: CraftyEntity): Dict {
  return {
    direction: b['direction'], x: b.x, y: b.y, w: num(b.w), h: num(b.h), speed: b['speed'],
    damage: num(b['damage']), rotation: b.rotation, alpha: num(b.alpha),
  };
}

/** Run every handler registered for the target type, like a collision would. */
function runHit(s: Scene, bullet: CraftyEntity): Dict {
  const before = s.target['curHealth'] as number;
  const errors: string[] = [];
  for (const h of bullet.hitHandlers.filter((x) => x.type === 'EnemyCharacter')) {
    try {
      (h.cb as Fn).call(bullet, [{ obj: s.target }]);
    } catch (e) {
      errors.push(String(e));
    }
  }
  return {
    handlers: bullet.hitHandlers.map((h) => h.type),
    damageDealt: num(before - (s.target['curHealth'] as number)),
    targetCaptured: s.target['isCaptured'],
    targetFrozen: s.target['isFrozen'],
    targetSpeed: s.target['characterSpeed'],
    attackerCurCount: s.info.curCount,
    bulletDead: bullet['isDead'],
    errors,
  };
}

function describeAbility(name: string): Dict {
  const s = scene(name);
  const d = s.defaults;
  const cd = d['cooldown'] as number;
  const out: Dict = {
    type: d['type'], maxActive: d['maxActive'], cooldown: cd, speed: d['speed'],
    damage: num(d['damage']), w: num(d['w']), h: num(d['h']),
  };

  fire(s, name);
  const spawned = s.bullets();
  out['spawned'] = spawned.length;
  out['info'] = { ...s.info };
  out['bullets'] = spawned.map(snapshot);

  s.env.clock.advance(40);
  out['afterTwoFrames'] = spawned.map(snapshot);

  // Cooldown boundary is strict (>), measured from lastUsed, once a slot is free.
  const lastUsed = s.info.lastUsed;
  s.info.curCount = 0;
  const probe: Record<string, boolean> = {};
  for (const delta of [cd - 1, cd, cd + 1]) {
    s.env.clock.now = lastUsed + delta;
    probe[String(delta)] = canFire(s, name);
  }
  out['canFireAtCooldown'] = probe;

  s.attacker['isFrozen'] = true;
  out['canFireWhileFrozen'] = canFire(s, name);
  s.attacker['isFrozen'] = false;

  const first = spawned[0];
  if (first) out['hit'] = runHit(s, first);
  return out;
}

/** Fire past each cooldown without any bullet dying: maxActive caps successful fires. */
function maxActiveEnforcement(name: string): Dict {
  const s = scene(name);
  const cd = s.defaults['cooldown'] as number;
  const max = s.defaults['maxActive'] as number;
  const results: boolean[] = [];
  const counts: number[] = [];
  for (let i = 0; i < Math.min(max, 12) + 2; i++) {
    s.env.clock.now += cd + 1;
    const ok = canFire(s, name);
    results.push(ok);
    if (ok) fire(s, name);
    counts.push(s.info.curCount);
  }
  return { results, counts };
}

function omniSpread(name: string): Dict {
  const s = scene(name, 'e');
  fire(s, name);
  const bullets = s.bullets();
  const start = bullets.map((b) => ({ x: b.x, y: b.y }));
  s.env.clock.advance(20);
  return {
    count: bullets.length,
    curCount: s.info.curCount,
    canFireAfter: canFire(s, name),
    directions: bullets.map((b) => b['direction']),
    rotations: bullets.map((b) => b.rotation),
    deltas: bullets.map((b, i) => [b.x - (start[i]?.x ?? 0), b.y - (start[i]?.y ?? 0)]),
    speeds: bullets.map((b) => b['speed']),
  };
}

/**
 * Sonar Blast and Fireball change per Delay step. The vendored Crafty removes a delay with
 * repeat -1 after one run (repeat <= 0), so the natural run count is recorded separately and the
 * per-step decay is driven by invoking the queued callback directly.
 */
function delayShrink(name: string): Dict {
  const s = scene(name);
  fire(s, name);
  const b = s.bullets()[0] as CraftyEntity;
  const delayEntity = [...s.env.crafty.entities.values()].find(
    (e) => (e['_delays'] as unknown[] | undefined)?.length,
  ) as CraftyEntity;
  const item = (delayEntity['_delays'] as { func: Fn; delay: number; repeat: number }[])[0];
  if (!item) throw new Error('no delay queued');
  const step = (i: number): Dict => ({
    step: i, damage: num(b['damage']), alpha: num(b.alpha), w: num(b.w), h: num(b.h),
  });
  const steps = [step(0)];
  for (let i = 1; i <= 60; i++) {
    item.func.call(delayEntity);
    if (i <= 5 || i % 10 === 0) steps.push(step(i));
  }

  const natural = scene(name);
  fire(natural, name);
  natural.env.clock.advance(1000);
  return {
    delayMs: item.delay,
    repeat: item.repeat,
    naturalRunsIn1s: ((natural.bullets()[0]?.['damage'] as number) !== natural.defaults['damage']) ? 'ran' : 'idle',
    steps,
  };
}

function directionHandling(name: string): Dict {
  const out: Dict = {};
  for (const dir of DIRECTIONS) {
    const s = scene(name, dir);
    fire(s, name);
    const b = s.bullets()[0] as CraftyEntity;
    const start = { x: b.x, y: b.y };
    const rotation = b.rotation;
    s.env.clock.advance(20);
    out[dir] = { rotation, dx: b.x - start.x, dy: b.y - start.y };
  }
  return out;
}

function collect(): Dict {
  const abilities = loadLegacy({ seed: SEED }).globals.GameHelper['abilities'] as Abilities;
  const typeOf = (n: string): string => String(abilities[n]?.component.defaults['type']);
  const ranged = Object.keys(abilities).filter((n) => typeOf(n).includes('Range'));
  const omni = ranged.filter((n) => typeOf(n).includes('Omni'));
  const result: Dict = {
    rangeAbilities: ranged,
    omniAbilities: omni,
    abilities: Object.fromEntries(ranged.map((n) => [n, describeAbility(n)])),
    maxActive: Object.fromEntries(ranged.map((n) => [n, maxActiveEnforcement(n)])),
    omni: Object.fromEntries(omni.map((n) => [n, omniSpread(n)])),
    shrink: { 'Sonar Blast': delayShrink('Sonar Blast'), Fireball: delayShrink('Fireball') },
    directions: Object.fromEntries(
      ranged.filter((n) => !omni.includes(n)).map((n) => [n, directionHandling(n)]),
    ),
  };
  return JSON.parse(JSON.stringify(result)) as Dict;
}

describe('range and omni ability characterization', () => {
  const observed = collect();
  if (UPDATE) {
    mkdirSync(dirname(FIXTURE), { recursive: true });
    writeFileSync(FIXTURE, `${JSON.stringify(observed, null, 2)}\n`);
  }
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Dict;

  it('lists the range and omni abilities', () => {
    expect(observed['rangeAbilities']).toEqual(fixture['rangeAbilities']);
    expect(observed['omniAbilities']).toEqual(fixture['omniAbilities']);
  });

  for (const section of ['abilities', 'maxActive', 'omni', 'shrink', 'directions']) {
    it(`matches the recorded ${section}`, () => {
      expect(observed[section]).toEqual(fixture[section]);
    });
  }
});
