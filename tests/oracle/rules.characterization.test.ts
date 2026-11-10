import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadLegacy, type LegacyEnv } from '@testing/legacy/load-legacy';

/**
 * Characterization of the legacy rules (levels, health/damage/heal scaling, elemental matrix,
 * applyDamage, capture threshold, XP, chapters). Asserts today's behaviour, bugs included.
 * Run with TTE_UPDATE_FIXTURES=1 to (re)write tests/fixtures/legacy/rules.json.
 */
const FIXTURE = resolve(import.meta.dirname, '../fixtures/legacy/rules.json');
const UPDATE = process.env['TTE_UPDATE_FIXTURES'] === '1';
const recorded: Record<string, unknown> = {};
const committed: Record<string, unknown> =
  !UPDATE && existsSync(FIXTURE)
    ? (JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>)
    : {};

afterAll(() => {
  if (!UPDATE) return;
  mkdirSync(dirname(FIXTURE), { recursive: true });
  writeFileSync(FIXTURE, `${JSON.stringify(recorded, null, 1)}\n`);
});

function check(section: string, actual: unknown): void {
  const normalized: unknown = JSON.parse(JSON.stringify(actual));
  if (UPDATE) {
    recorded[section] = normalized;
    return;
  }
  expect(normalized).toEqual(committed[section]);
}

/** A float as its number and its exact Float64 bits (hex). */
function fl(n: number): { v: number; bits: string } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, n);
  return { v: n, bits: view.getBigUint64(0).toString(16).padStart(16, '0') };
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
type Obj = Record<string, any>;

const ELEMENTS = ['fire', 'water', 'earth', 'air', 'void'] as const;
const DIFFICULTIES = { Easy: 0.25, Casual: 0.66, Normal: 0.85, Hard: 1.12, WTF: 1.5 };
const BASE_DAMAGES = [10, 13, 40, 140, Number.MAX_VALUE];

function setup(seed = 1): { env: LegacyEnv; g: Obj; setState: (s: Obj) => void } {
  const env = loadLegacy({ seed });
  const g = env.globals as unknown as Obj;
  const setState = (s: Obj): void => {
    g['GamePersist'].saveGameState(s);
  };
  return { env, g, setState };
}

/** Stub entity carrying the legacy Character component's methods and defaults. */
function stubCharacter(env: LegacyEnv, props: Obj, components: string[] = []): Obj {
  const def = env.crafty.components['Character'] as Obj;
  const entity: Obj = {};
  for (const k of Object.keys(def)) if (k !== 'init') entity[k] = def[k];
  entity['abilitiesInfo'] = {};
  entity['has'] = (name: string) => components.includes(name);
  return Object.assign(entity, props);
}

describe('legacy rules characterization', () => {
  it('getLevel(0..100)', () => {
    const { g } = setup();
    const out: Record<string, number> = {};
    for (let xp = 0; xp <= 100; xp++) out[String(xp)] = g['Garrison'].getLevel(xp);
    check('getLevel', out);
  });

  it('getHealth / getDamageMultiplier / getHealMultiplier for L 0..20', () => {
    const { g } = setup();
    const H = g['GameHelper'];
    const out: Obj = { health: {}, damageMultiplier: {}, healMultiplier: {} };
    for (let level = 0; level <= 20; level++) {
      out['damageMultiplier'][level] = fl(H.getDamageMultiplier(level) as number);
      out['healMultiplier'][level] = fl(H.getHealMultiplier(level) as number);
      for (const h of [90, 100, 120, 130, 150, 1000]) {
        out['health'][`${String(h)}@${String(level)}`] = H.getHealth(h, level);
      }
    }
    check('levelScaling', out);
  });

  it('elemental multiplier matrix 5x5', () => {
    const { env } = setup();
    const c = stubCharacter(env, {});
    const out: Obj = {};
    for (const hit of ELEMENTS) {
      for (const hitter of ELEMENTS) {
        out[`${hit}<-${hitter}`] = {
          damage: fl(c['getElementalDamageMultiplier'](hit, hitter) as number),
          reduction: fl(c['getElementalDamageReductionMultiplier'](hit, hitter) as number),
        };
      }
    }
    check('elementalMatrix', out);
  });

  it('applyDamage: base damage x elements x damage decrease', () => {
    const { env, g } = setup();
    const rockArmour = g['GameHelper'].abilities['Rock Armour'].component.defaults
      .damageDecreasePercentage as number;
    const out: Obj = { rockArmourDecrease: rockArmour, results: {} };
    for (const dmg of BASE_DAMAGES) {
      for (const victimType of ELEMENTS) {
        for (const attackerType of ELEMENTS) {
          for (const dec of [0, rockArmour]) {
            const attacker = stubCharacter(env, { elementalType: attackerType, damageMultiplier: 1 });
            const victim = stubCharacter(env, {
              elementalType: victimType,
              targetPlayer: attacker,
              damageDecreasePercentage: dec,
              curHealth: 100,
              maxHealth: 100,
            });
            const ret = victim['applyDamage'](dmg) as number;
            out['results'][`${String(dmg)}|${victimType}<-${attackerType}|dec${String(dec)}`] = {
              returned: fl(ret),
              curHealth: fl(victim['curHealth'] as number),
            };
          }
        }
      }
    }
    check('applyDamageMatrix', out);
  });

  it('applyDamage: difficulty presets via addLevelBonus (player vs enemy attacker)', () => {
    const { env, g, setState } = setup();
    const out: Obj = {};
    for (const [name, difficulty] of Object.entries(DIFFICULTIES)) {
      setState({ chapter: 1, difficulty, garrison: [] });
      for (const role of ['PlayerCharacter', 'EnemyCharacter']) {
        for (const experience of [0, 20, 100]) {
          const attacker = stubCharacter(env, { maxHealth: 100, elementalType: 'fire' }, [role]);
          g['Garrison'].addLevelBonus({ experience }, attacker);
          for (const dec of [0, 75]) {
            for (const dmg of BASE_DAMAGES) {
              const victim = stubCharacter(env, {
                elementalType: 'fire',
                targetPlayer: attacker,
                damageDecreasePercentage: dec,
                curHealth: 1e6,
                maxHealth: 1e6,
              });
              const ret = victim['applyDamage'](dmg) as number;
              out[`${name}|${role}|xp${String(experience)}|dec${String(dec)}|${String(dmg)}`] = fl(ret);
            }
          }
          out[`${name}|${role}|xp${String(experience)}|attacker`] = {
            level: attacker['level'],
            maxHealth: fl(attacker['maxHealth'] as number),
            curHealth: fl(attacker['curHealth'] as number),
            maxHealthWithRest: fl(attacker['maxHealthWithRest'] as number),
            damageMultiplier: fl(attacker['damageMultiplier'] as number),
            healMultiplier: fl(attacker['healMultiplier'] as number),
          };
        }
      }
    }
    check('applyDamageDifficulty', out);
  });

  it('applyDamage edge cases: overkill, >100% decrease, negative and zero input', () => {
    const { env } = setup();
    const mk = (props: Obj): Obj => {
      const attacker = stubCharacter(env, { elementalType: 'air', damageMultiplier: 1 });
      return stubCharacter(env, {
        elementalType: 'air',
        targetPlayer: attacker,
        curHealth: 20,
        maxHealth: 100,
        ...props,
      });
    };
    const out: Obj = {};
    const cases: [string, Obj, number][] = [
      ['overkill', {}, 500],
      ['decrease150', { damageDecreasePercentage: 150 }, 40],
      ['negativeInput', {}, -10],
      ['zero', {}, 0],
    ];
    for (const [name, props, dmg] of cases) {
      const v = mk(props);
      const ret = v['applyDamage'](dmg) as number;
      out[name] = { returned: fl(ret), curHealth: fl(v['curHealth'] as number) };
    }
    check('applyDamageEdges', out);
  });

  it('heal: multiplier and clamp to maxHealth', () => {
    const { env } = setup();
    const out: Obj = {};
    for (const mult of [1, 1.1, 1.1 ** 5, 1 / 0.66]) {
      for (const cur of [10, 50, 100]) {
        for (const amount of [5, 10, 50, 1000]) {
          const c = stubCharacter(env, { curHealth: cur, maxHealth: 100, healMultiplier: mult });
          c['heal'](amount);
          out[`mult${String(mult)}|cur${String(cur)}|amt${String(amount)}`] = fl(
            c['curHealth'] as number,
          );
        }
      }
    }
    check('heal', out);
  });

  it('isCapturable at the 25% boundary', () => {
    const { env, g } = setup();
    const pct = g['Game'].capturableHealthPercentage as number;
    const out: Obj = { capturableHealthPercentage: pct };
    for (const max of [100, 130, 90, 1000]) {
      const edge = max * pct;
      for (const cur of [0, -5, edge - 0.001, edge, edge + 0.001, max]) {
        const c = stubCharacter(env, { curHealth: cur, maxHealth: max });
        // isCapturable lives on the EnemyCharacter component, not Character.
        c['isCapturable'] = (env.crafty.components['EnemyCharacter'] as Obj)['isCapturable'];
        out[`${String(max)}|${String(cur)}`] = c['isCapturable']();
      }
    }
    check('isCapturable', out);
  });

  it('addXP per chapter over 200 seeded draws (distribution and cap)', () => {
    const out: Obj = {};
    for (const chapter of [1, 2, 3, 4, 5]) {
      const { g, setState } = setup(7);
      const mk = (experience: number): Obj => ({ id: 'a', experience, characterName: 'x' });
      const hist: Record<string, number> = {};
      for (let i = 0; i < 200; i++) {
        const gc = mk(0);
        setState({ chapter, garrison: [gc] });
        const gained = g['Garrison'].addXP(gc) as number;
        hist[String(gained)] = (hist[String(gained)] ?? 0) + 1;
      }
      const sequence: number[] = [];
      const gc = mk(0);
      setState({ chapter, garrison: [gc] });
      for (let i = 0; i < 200; i++) {
        g['Garrison'].addXP(gc);
        sequence.push(gc['experience'] as number);
      }
      const capped: Obj = {};
      for (const start of [4, 5, 19, 20, 49, 50, 99, 100, 150]) {
        const c = mk(start);
        setState({ chapter, garrison: [c] });
        const gained = g['Garrison'].addXP(c) as number;
        capped[String(start)] = { gained, experience: c['experience'] };
      }
      out[`chapter${String(chapter)}`] = {
        maxXP: g['Garrison'].MaxXP[`chapter${String(chapter)}`] ?? null,
        histogram: hist,
        sequence,
        capped,
      };
    }
    check('addXP', out);
  });

  it('objectivesMet / getProgress for crafted garrisons per chapter', () => {
    const { g, setState } = setup();
    const out: Obj = {};
    const gar = (xps: number[]): Obj[] =>
      xps.map((experience, i) => ({ id: `c${String(i)}`, experience }));
    const record = (key: string, state: Obj): void => {
      setState(state);
      out[key] = { met: g['Garrison'].objectivesMet(), progress: g['Garrison'].getProgress() };
    };
    record('noSave', { chapter: 0 });
    for (const xp of [0, 1, 4, 5, 6]) record(`ch1|xp${String(xp)}`, { chapter: 1, garrison: gar([xp]) });
    const ch2 = [
      [1], [1, 1], [1, 1, 1], [20, 20, 20], [20, 25, 25], [20, 20, 19], [20, 20, 26],
      [20, 20, 20, 1], [26, 26, 26, 26], [20, 20, 20, 20, 20],
    ];
    ch2.forEach((xps, i) => {
      record(`ch2|${String(i)}|${xps.join(',')}`, { chapter: 2, garrison: gar(xps) });
    });
    const ch3 = [[50], [50, 50], [50, 50, 50], [59, 50, 55], [60, 50, 50], [50, 50, 49], [100, 100, 100]];
    ch3.forEach((xps, i) => {
      record(`ch3|${String(i)}|${xps.join(',')}`, { chapter: 3, garrison: gar(xps) });
    });
    record('ch4|incomplete', { chapter: 4, garrison: gar([100, 100, 100]) });
    record('ch4|complete', { chapter: 4, garrison: gar([100, 100, 100]), completeTime: 1 });
    record('ch5|complete', { chapter: 5, garrison: gar([100]), completeTime: 1 });
    record('ch5|incomplete', { chapter: 5, garrison: gar([100]) });
    check('objectives', out);
  });

  it('addChapter, including the complete flag', () => {
    const { g, setState } = setup();
    const out: Obj = {};
    for (const chapter of [1, 2, 3, 4, 5]) {
      for (const complete of [false, true]) {
        setState({ chapter, garrison: [], ...(complete ? { completeTime: 1 } : {}) });
        g['Garrison'].addChapter();
        out[`ch${String(chapter)}|complete${String(complete)}`] =
          g['GamePersist'].getGameState().chapter;
      }
    }
    check('addChapter', out);
  });

  it('Capture is granted to PlayerCharacter at chapter > 1 only', () => {
    const { env, g, setState } = setup();
    const out: Obj = {};
    for (const chapter of [1, 2, 3, 4]) {
      for (const role of ['PlayerCharacter', 'EnemyCharacter']) {
        setState({ chapter, difficulty: 0.66, garrison: [] });
        const c = stubCharacter(env, { maxHealth: 100 }, [role]);
        g['Garrison'].addLevelBonus({ experience: 10 }, c);
        out[`ch${String(chapter)}|${role}`] = c['abilitiesInfo'];
      }
    }
    setState({ chapter: 2, difficulty: 0.66, garrison: [] });
    const noXp = stubCharacter(env, { maxHealth: 100 }, ['PlayerCharacter']);
    g['Garrison'].addLevelBonus({ experience: null }, noXp);
    out['nullExperience'] = {
      abilitiesInfo: noXp['abilitiesInfo'],
      maxHealth: noXp['maxHealth'],
      level: noXp['level'],
    };
    check('captureGranted', out);
  });
});
