import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadLegacy, type LegacyEnv } from '@testing/legacy/load-legacy';

/**
 * Characterization of the enemy AI in baseCharacter.js (EnemyCharacter): attack direction,
 * axis checks, attack preconditions, movement choice and the movement timers.
 * Observations are recorded to tests/fixtures/legacy/ai.json with TTE_UPDATE_FIXTURES=1 and
 * otherwise compared against it.
 */

const FIXTURE = resolve(import.meta.dirname, '../fixtures/legacy/ai.json');
const UPDATE = process.env['TTE_UPDATE_FIXTURES'] === '1';
const recorded: Record<string, unknown> = {};
const fixture: Record<string, unknown> = UPDATE
  ? {}
  : (JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>);

/** Compare to the committed fixture, or record when updating. */
function check(name: string, value: unknown): void {
  const plain: unknown = JSON.parse(JSON.stringify(value));
  if (UPDATE) recorded[name] = plain;
  else expect(plain).toEqual(fixture[name]);
}

afterAll(() => {
  if (!UPDATE) return;
  mkdirSync(resolve(FIXTURE, '..'), { recursive: true });
  writeFileSync(FIXTURE, `${JSON.stringify(recorded, null, 2)}\n`);
});

function observe(env: LegacyEnv, body: string): unknown {
  return JSON.parse(env.run(`JSON.stringify((function () {\n${body}\n})())`) as string);
}

/** Legacy-side helpers: an inert enemy (its own EnterFrame AI is unbound) facing a stub player. */
const PRELUDE = `
  function info() { return { curCount: 0, lastUsed: 0 }; }
  function enemy(abilities, props) {
    var e = Crafty.e('EnemyCharacter');
    e.unbind('EnterFrame');
    e.pauseAnimation = function () {}; e.resumeAnimation = function () {};
    e.x = 500; e.y = 300; e.w = 80; e.h = 80; e.direction = 'w';
    e.characterSpeed = 7; e.curHealth = 100; e.maxHealth = 100; e.isDead = false;
    e.elementalType = 'fire'; e.damageMultiplier = 1; e.healMultiplier = 1;
    e.abilitiesInfo = {};
    for (var i = 0; i < abilities.length; i++) e.abilitiesInfo[abilities[i]] = info();
    for (var k in props) e[k] = props[k];
    return e;
  }
  function player(e, dx, dy, w, h) {
    var p = Crafty.e('PlayerCharacter');
    p.unbind('EnterFrame');
    p.x = e.x + dx; p.y = e.y + dy; p.w = w || 80; p.h = h || 80;
    p.elementalType = 'water'; p.damageMultiplier = 1; p.curHealth = 100; p.maxHealth = 100;
    p.isDead = false;
    e.targetPlayer = p; p.targetPlayer = e;
    return p;
  }
  function pendingDelays() {
    var ms = [];
    Crafty('Delay').each(function () { this._delays.forEach(function (d) { ms.push(d.delay); }); });
    return ms.sort(function (a, b) { return a - b; });
  }
`;

const GRID = [-100, -41, -40, -1, 0, 1, 40, 41, 100];
const GRID_NARROW = [-60, -51, -50, -31, -30, 0, 30, 31, 50, 51, 60];
const GRID_MOVE = [-100, -7, -1, 0, 1, 7, 100];

describe('enemy AI (baseCharacter.js)', () => {
  it('updateAttackDirection and isInRangeAxis over a grid of relative positions', () => {
    const env = loadLegacy({ seed: 1 });
    const cases = (sizes: [number, number], grid: number[]): unknown =>
      observe(
        env,
        `${PRELUDE}
        var rows = [];
        [${grid.join(',')}].forEach(function (dx) {
          [${grid.join(',')}].forEach(function (dy) {
            ['w', 'e'].forEach(function (start) {
              var e = enemy(['Fire Blast'], { direction: start });
              player(e, dx, dy, ${String(sizes[0])}, ${String(sizes[1])});
              e.updateAttackDirection();
              var viaUpdate = e.direction;
              e.direction = start;
              var inAxis = e.isInRangeAxis();
              rows.push([dx, dy, start, viaUpdate, inAxis, e.direction]);
            });
          });
        });
        return rows;`,
      );
    const square = cases([80, 80], GRID) as [number, number, string, string, boolean, string][];
    const tall = cases([60, 100], GRID_NARROW);
    check('direction.square80', { columns: 'dx,dy,start,updateAttackDirection,isInRangeAxis,directionAfterIsInRangeAxis', rows: square });
    check('direction.w60h100', { columns: 'dx,dy,start,updateAttackDirection,isInRangeAxis,directionAfterIsInRangeAxis', rows: tall });
    // Same-column target below: face south. Same-row target to the right: face east.
    const at = (dx: number, dy: number, start: string): string[] | undefined =>
      square.find((r) => r[0] === dx && r[1] === dy && r[2] === start)?.slice(3, 4) as string[] | undefined;
    expect(at(0, 100, 'w')).toEqual(['s']);
    expect(at(100, 0, 'w')).toEqual(['e']);
    // Off both axes the direction is left alone.
    expect(at(100, 100, 'e')).toEqual(['e']);
  });

  it('doPrimaryAttackIfNecessary preconditions (range and melee primaries)', () => {
    const env = loadLegacy({ seed: 1 });
    const fired = (ability: string, pre: string): unknown =>
      observe(
        env,
        `${PRELUDE}
        var rows = [];
        [${GRID.join(',')}].forEach(function (dx) {
          [${GRID.join(',')}].forEach(function (dy) {
            var e = enemy([${JSON.stringify(ability)}], { direction: 'w' });
            player(e, dx, dy);
            ${pre}
            e.doPrimaryAttackIfNecessary();
            var i = e.abilitiesInfo[${JSON.stringify(ability)}];
            rows.push([dx, dy, i.curCount, i.lastUsed !== 0, e.direction]);
          });
        });
        return rows;`,
      );
    check('primary.range.fireBlast', fired('Fire Blast', ''));
    check('primary.range.fireBlast.frozen', fired('Fire Blast', 'e.isFrozen = true;'));
    check('primary.range.fireBlast.maxActive', fired('Fire Blast', "e.abilitiesInfo['Fire Blast'].curCount = 2;"));
    check('primary.range.fireBlast.cooldown', fired('Fire Blast', "e.abilitiesInfo['Fire Blast'].lastUsed = new Date().getTime();"));
    check('primary.melee.groundShock', fired('Ground Shock', ''));
    check('primary.melee.stranglingBranches', fired('Strangling Branches', ''));
    check('primary.melee.groundShock.frozen', fired('Ground Shock', 'e.isFrozen = true;'));
  });

  it('doSecondaryAttackIfNecessary preconditions', () => {
    const env = loadLegacy({ seed: 1 });
    const states: Record<string, string> = {
      ready: '',
      frozen: 'e.isFrozen = true;',
      cooldown: "e.abilitiesInfo[SEC].lastUsed = new Date().getTime();",
      maxActive: "e.abilitiesInfo[SEC].curCount = 1000;",
      hurt: 'e.curHealth = 40;',
    };
    const table: Record<string, unknown> = {};
    for (const [secondary, dx, dy] of [
      ['Entangling Vines', 30, 0],
      ['Entangling Vines', 0, 100],
      ['Entangling Vines', 100, 0],
      ['Entangling Vines', 400, 0],
      ['Fire Heal', 0, 0],
      ['Fire Blast', 400, 400],
    ] as [string, number, number][]) {
      for (const [state, pre] of Object.entries(states)) {
        table[`${secondary}@${String(dx)},${String(dy)}/${state}`] = observe(
          env,
          `${PRELUDE}
          var SEC = ${JSON.stringify(secondary)};
          var e = enemy(['Fire Blast', SEC].filter(function (v, i, a) { return a.indexOf(v) === i; }), {});
          if (SEC === 'Fire Blast') { e.abilitiesInfo = { 'Stick': info(), 'Fire Blast': info() }; }
          player(e, ${String(dx)}, ${String(dy)});
          ${secondary === 'Fire Heal' && state !== 'ready' ? 'e.curHealth = 40;' : ''}
          ${pre}
          var before = e.abilitiesInfo[SEC].lastUsed;
          var ret = e.doSecondaryAttackIfNecessary();
          return { returned: ret === undefined ? 'undefined' : ret,
            used: e.abilitiesInfo[SEC].lastUsed !== before, hp: e.curHealth };`,
        );
      }
    }
    // With a single ability there is no secondary and nothing happens.
    table['noSecondary'] = observe(
      env,
      `${PRELUDE}
      var e = enemy(['Fire Blast'], {}); player(e, 100, 0);
      return { returned: String(e.doSecondaryAttackIfNecessary()), count: e.abilitiesInfo['Fire Blast'].curCount };`,
    );
    check('secondary', table);
  });

  it('doMovement chooses moveTowards or moveAway', () => {
    const env = loadLegacy({ seed: 1 });
    const table: Record<string, unknown> = {};
    for (const primary of ['Fire Blast', 'Ground Shock']) {
      for (const selfMelee of [false, true]) {
        for (const targetMelee of [false, true]) {
          for (const ready of [true, false]) {
            table[`${primary}/selfMelee=${String(selfMelee)}/targetMelee=${String(targetMelee)}/ready=${String(ready)}`] = observe(
              env,
              `${PRELUDE}
              var e = enemy([${JSON.stringify(primary)}], {});
              var p = player(e, 200, 0);
              ${selfMelee ? "e.addComponent('MeleeCharacter');" : ''}
              ${targetMelee ? "p.addComponent('MeleeCharacter');" : ''}
              ${ready ? '' : `e.abilitiesInfo[${JSON.stringify(primary)}].lastUsed = new Date().getTime();`}
              var chosen = [];
              e.moveAwayFromTargetPlayer = function () { chosen.push('away'); };
              e.moveTowardsTargetPlayer = function () { chosen.push('towards'); };
              e.doMovement(${JSON.stringify(primary)});
              e.isFrozen = true; e.doMovement(${JSON.stringify(primary)});
              return chosen;`,
            );
          }
        }
      }
    }
    check('doMovement', table);
  });

  it('moveTowardsTargetPlayer over a grid of relative positions (seeded random)', () => {
    const env = loadLegacy({ seed: 1 });
    const rows = observe(
      env,
      `${PRELUDE}
      var rows = [];
      [${GRID_MOVE.join(',')}].forEach(function (dx) {
        [${GRID_MOVE.join(',')}].forEach(function (dy) {
          var e = enemy(['Fire Blast'], {});
          player(e, dx, dy);
          e.moveTowardsTargetPlayer();
          rows.push([dx, dy, e.x - 500, e.y - 300, e.previousX - 500, e.previousY - 300]);
        });
      });
      return { columns: 'dx,dy,movedX,movedY,previousX,previousY', rows: rows, delays: pendingDelays() };`,
    ) as { rows: number[][]; delays: number[] };
    check('moveTowards', rows);
    expect(rows.delays).toEqual([]); // moveTowards schedules no timers
  });

  describe('moveAwayFromTargetPlayer timers', () => {
    it('records the Delay values and state in open space and against walls', () => {
      // The clock lives outside the vm, so each scenario is replayed step by step from the host.
      const results: Record<string, unknown> = {};
      const defs: [string, string, number][] = [
        ['open', 'false', 1],
        ['blockedX', 'this.x > 503 || this.x < 497', 1],
        ['blockedY', 'this.y > 303 || this.y < 297', 1],
        ['blockedBoth', 'true', 1],
        ['stuckFiveTimes', 'true', 5],
      ];
      for (const [name, solid, calls] of defs) {
        const env = loadLegacy({ seed: 1 });
        env.run(`${PRELUDE}
          var e = enemy(['Fire Blast'], {});
          player(e, 60, 20);
          e.hit = function () { return ${solid}; };
          function snap() {
            return JSON.stringify({ dx: e.x - 500, dy: e.y - 300, moveAwayX: e.moveAwayXDirection || null,
              moveAwayY: e.moveAwayYDirection || null, samePositionCount: e.samePositionCount || 0,
              checkActive: e.samePositionCheckActive || null, delays: pendingDelays() });
          }`);
        const steps: unknown[] = [];
        for (let i = 0; i < calls; i++) {
          env.run('e.moveAwayFromTargetPlayer()');
          steps.push({ afterCall: JSON.parse(env.run('snap()') as string) as unknown });
          env.clock.advance(2020);
          steps.push({ after2020: JSON.parse(env.run('snap()') as string) as unknown });
          env.clock.advance(1000);
          steps.push({ after3020: JSON.parse(env.run('snap()') as string) as unknown });
        }
        results[name] = steps;
      }
      check('moveAway', results);
      // The first call from open space only schedules the 2000 ms same-position check.
      const open = results['open'] as { afterCall: { delays: number[] } }[];
      expect(open[0]?.afterCall.delays).toEqual([2000]);
    });
  });
});
