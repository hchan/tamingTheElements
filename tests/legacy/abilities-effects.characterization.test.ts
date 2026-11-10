import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadLegacy, type LegacyEnv } from '@testing/legacy/load-legacy';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return --
   legacy entities are untyped; this suite only observes them. */

const FIXTURE = resolve(import.meta.dirname, '../fixtures/legacy/abilities-effects.json');
const UPDATE = process.env['TTE_UPDATE_FIXTURES'] === '1';
const recorded: Record<string, unknown> = {};
const saved: Record<string, unknown> = UPDATE ? {} : JSON.parse(readFileSync(FIXTURE, 'utf8'));

/** Records `value` under `key` (update mode) or asserts it equals the committed fixture. */
function check(key: string, value: unknown): void {
  const plain = JSON.parse(JSON.stringify(value)) as unknown;
  if (UPDATE) recorded[key] = plain;
  else expect(plain, key).toEqual(saved[key]);
}

afterAll(() => {
  if (!UPDATE) return;
  mkdirSync(dirname(FIXTURE), { recursive: true });
  writeFileSync(FIXTURE, JSON.stringify(recorded, null, 1) + '\n');
});

const f64 = (n: number): { v: number; hex: string } => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, n);
  return { v: n, hex: view.getBigUint64(0).toString(16).padStart(16, '0') };
};

interface Rig {
  env: LegacyEnv;
  me: any;
  foe: any;
  make: (type: string, race: string, x: number, y: number) => any;
  fire: (ability: string, who?: any) => any;
  hit: (ability: any, target?: any) => void;
  advance: (ms: number) => void;
}

/** Player (Fourway) vs enemy (no Fourway), targeting each other, with a minimal HUD. */
function rig(playerRace = 'Pax', enemyRace = 'Morblass'): Rig {
  const env = loadLegacy({ seed: 1 });
  env.crafty.audio.play = () => ({ volume: 1 });
  // The stub has no SpriteAnimation; the effects under test only need these to exist.
  const noop = (): unknown => undefined;
  env.crafty.components['SpriteAnimation'] = {
    reel: noop, animate: noop, pauseAnimation: noop, resumeAnimation: noop, isPlaying: noop,
  };
  // SpriteColor is stubbed out of the loader entirely; freeze() without skipColorChange needs it.
  env.crafty.components['SpriteColor'] = {
    spriteColor(this: { crafty?: unknown }, ...args: unknown[]) {
      env.crafty.calls.push({ target: 'SpriteColor', method: 'spriteColor', args });
      return this;
    },
  };
  const make = (type: string, race: string, x: number, y: number): any => {
    const e = env.crafty.e(`${type}, ${race}`);
    e.x = x;
    e.y = y;
    e.topHUD = { buffs: {} };
    e.unbind('EnterFrame'); // no AI or flipping: only the ability under test acts
    return e;
  };
  const me = make('PlayerCharacter', playerRace, 100, 100);
  const foe = make('EnemyCharacter', enemyRace, 300, 100);
  me.targetPlayer = foe;
  foe.targetPlayer = me;
  const fire = (name: string, who: any = me): any => {
    who.abilitiesInfo[name] ??= { curCount: 0, lastUsed: 0 };
    const ability: any = env.crafty.e(name);
    ability.initAbility(who);
    return ability;
  };
  const hit = (ability: any, target: any = foe): void => {
    for (const h of ability.hitHandlers as { type: string; cb: (...a: unknown[]) => void }[]) {
      if (h.type === (ability.character?.targetPlayerType as string))
        h.cb.call(ability, [{ obj: target }]);
    }
  };
  return { env, me, foe, make, fire, hit, advance: (ms) => { env.clock.advance(ms); } };
}

const snap = (c: any): Record<string, unknown> => ({
  speed: f64(c.characterSpeed),
  dmgDec: c.damageDecreasePercentage,
  hp: f64(c.curHealth),
  frozen: c.isFrozen,
  translucent: c.isTranslucent,
  sprite: c.spriteName,
  controlsDisabled: c.disableControls ?? null,
});
const callsOf = (r: Rig, method: string): unknown[][] =>
  r.env.crafty.calls.filter((c) => c.method === method).map((c) => c.args);

describe('legacy abilities: melee range geometry', () => {
  const OFFSETS = [0, 5, 16, 24, 32, 40, 48, 64, 80, 100, 120, 128, 160, 200, 240, 320];
  const melee = [
    'Ground Shock', 'Hurricane', 'Steal Health', 'Ice Shock', 'Strangling Branches', 'Entangling Vines',
  ];
  const r = rig();
  const { GameHelper } = r.env.globals as any;

  for (const target of [{ w: 80, h: 80 }, { w: 40, h: 120 }]) {
    it(`range tables, target ${String(target.w)}x${String(target.h)}`, () => {
      const out: Record<string, unknown> = {};
      for (const name of melee) {
        const comp = GameHelper.abilities[name].component;
        const d = comp.defaults;
        const rows: string[] = [];
        for (const dy of OFFSETS) {
          let row = '';
          for (const dx of OFFSETS) {
            const attacker = { x: 500, y: 500 };
            Object.assign(r.foe, { x: 500 + dx, y: 500 + dy, w: target.w, h: target.h });
            (attacker as any).targetPlayer = r.foe;
            row += comp.isInRange(attacker, d.w, d.h) ? '1' : '0';
          }
          rows.push(row);
        }
        out[name] = { type: d.type, w: d.w, h: d.h, helper: comp.isInRange.toString().includes('Explosion') ? 'explosion' : 'directional', rows };
      }
      check(`range:${String(target.w)}x${String(target.h)}`, { offsets: OFFSETS, ...out });
    });
  }

  it('is symmetric in sign (uses abs) and independent of attacker size', () => {
    const comp = GameHelper.abilities['Ice Shock'].component;
    const probe = (ax: number, fx: number): boolean => {
      Object.assign(r.foe, { x: fx, y: 500, w: 80, h: 80 });
      return comp.isInRange({ x: ax, y: 500, targetPlayer: r.foe }, 240, 40);
    };
    check('range:sign', { right: probe(500, 530), left: probe(530, 500), far: probe(500, 800) });
  });
});

describe('legacy abilities: buffs', () => {
  it('Adrenaline: +5 speed, +25% damage reduction, restored after 3000 ms', () => {
    const r = rig();
    const out: Record<string, unknown> = { before: snap(r.me) };
    r.fire('Adrenaline');
    out['after'] = snap(r.me);
    out['info'] = r.me.abilitiesInfo['Adrenaline'];
    out['buff'] = r.me.topHUD.buffs['Adrenaline'];
    out['fourway'] = callsOf(r, 'fourway');
    r.advance(3000);
    out['at3000'] = snap(r.me).speed;
    r.advance(40);
    out['expired'] = snap(r.me);
    out['fourwayAfter'] = callsOf(r, 'fourway');
    check('adrenaline', out);
  });

  it('Adrenaline: stacks additively; dead character is restored without fourway refresh', () => {
    const r = rig();
    r.fire('Adrenaline');
    r.advance(1000);
    r.fire('Adrenaline');
    const stacked = snap(r.me);
    // The second cast doubles the sprite suffix, so restoreDefaultSprite throws inside the Delay.
    let error: string | null = null;
    try {
      r.advance(2040);
    } catch (e) {
      error = (e as Error).message;
    }
    check('adrenaline:stack', { stacked, error, afterFirst: snap(r.me) });
  });

  it('Fire Dance: +2 speed for 5000 ms, effect sprite alpha decays per frame', () => {
    const r = rig('Lavax');
    const before = snap(r.me);
    r.fire('Fire Dance');
    const sprite = [...r.env.crafty.entities.values()].find((e) => e.has('fireDance'));
    const out: Record<string, unknown> = { before, after: snap(r.me), buff: r.me.topHUD.buffs['Fire Dance'], spriteAlpha0: sprite?.alpha };
    r.advance(1000);
    out['alpha1s'] = f64(sprite?.alpha as number);
    r.advance(3980);
    out['at4980'] = snap(r.me).speed;
    r.advance(40);
    out['expired'] = snap(r.me);
    out['spriteDestroyed'] = sprite?.destroyed;
    check('fireDance', out);
  });

  it('Rock Armour: +75% damage reduction applied to incoming damage for 3000 ms', () => {
    const r = rig('Rokcore');
    const out: Record<string, unknown> = {};
    r.me.curHealth = 1000;
    r.me.maxHealth = 1000;
    const hit = (base: number): number => {
      const before = r.me.curHealth;
      r.me.applyDamage(base);
      return before - r.me.curHealth;
    };
    out['plain'] = [10, 40, 140].map(hit).map(f64);
    r.me.curHealth = 1000;
    r.fire('Rock Armour');
    out['armoured'] = { dec: r.me.damageDecreasePercentage, sprite: r.me.spriteName, hits: [10, 40, 140].map((b) => { r.me.curHealth = 1000; return hit(b); }).map(f64) };
    r.advance(3040);
    out['expired'] = { dec: r.me.damageDecreasePercentage, sprite: r.me.spriteName };
    check('rockArmour', out);
  });

  for (const [name, race, ms] of [
    ['Translucent Flame', 'Sindarosa', 1500],
    ['Fade', 'Echo', 3000],
  ] as const) {
    it(`${name}: translucent for ${String(ms)} ms, swaps sprite, restores`, () => {
      const r = rig(race);
      const defaultSprite = r.me.defaults.spriteName;
      const out: Record<string, unknown> = { before: snap(r.me), defaultSprite };
      r.fire(name);
      out['during'] = snap(r.me);
      out['buff'] = r.me.topHUD.buffs[name];
      out['size'] = [r.me.w, r.me.h];
      r.advance(ms - 20);
      out['justBefore'] = snap(r.me).translucent;
      r.advance(40);
      out['after'] = snap(r.me);
        check(`translucency:${name}`, out);
    });

    it(`${name}: a dead caster stays translucent forever`, () => {
      const r = rig(race);
      r.fire(name);
      r.me.isDead = true;
      r.advance(ms + 5000);
      check(`translucency:dead:${name}`, snap(r.me));
    });
  }
});

describe('legacy abilities: debuffs', () => {
  it('Tornado: freezes (with colour change), unfreezes after 3000 ms, translucent target immune', () => {
    const r = rig('Cyclonius', 'Pax');
    const ability = r.fire('Tornado');
    const out: Record<string, unknown> = {};
    r.hit(ability);
    out['frozen'] = { ...snap(r.foe), buff: r.foe.topHUD.buffs['Tornado'] };
    out['added'] = { spriteColor: r.foe.has('SpriteColor'), calls: callsOf(r, 'spriteColor') };
    r.advance(3040);
    out['expired'] = { ...snap(r.foe), spriteColor: r.foe.has('SpriteColor') };
    r.foe.isTranslucent = true;
    const second = r.fire('Tornado');
    r.hit(second);
    out['translucentImmune'] = r.foe.isFrozen;
    check('tornado', out);
  });

  it('Tornado: never unfreezes if the caster dies before expiry', () => {
    const r = rig('Cyclonius', 'Pax');
    r.hit(r.fire('Tornado'));
    r.me.isDead = true;
    r.advance(5000);
    check('tornado:casterDead', snap(r.foe));
  });

  it('Ice Blast: -2 speed with <0 clamp at hit and <0.2 clamp at expiry', () => {
    const out: Record<string, unknown> = {};
    for (const [label, race] of [['normal', 'Morblass'], ['dummy', 'dummy']] as const) {
      for (const start of [7, 3, 2.1, 2, 1, 0.5, 0.2, 0]) {
        const r = rig('Morblass', race === 'dummy' ? 'Morblass' : race);
        if (race === 'dummy') r.foe.defaults.characterSpeed = 0.2;
        r.foe.characterSpeed = start;
        const ability = r.fire('Ice Blast');
        r.hit(ability);
        const hitSpeed = r.foe.characterSpeed;
        const fw = callsOf(r, 'fourway');
        r.advance(3040);
        out[`${label}:${String(start)}`] = {
          start: f64(start),
          hit: f64(hitSpeed),
          expired: f64(r.foe.characterSpeed),
          fourway: fw.length,
          buff: r.foe.topHUD.buffs['Ice Blast'],
        };
      }
    }
    check('iceBlast:clamps', out);
  });

  it('Ice Blast: two hits stack, translucent immune, dead caster never restores', () => {
    const r = rig('Morblass', 'Pax');
    const a = r.fire('Ice Blast');
    r.hit(a);
    r.hit(a);
    const stacked = r.foe.characterSpeed;
    r.advance(3040);
    const afterStack = r.foe.characterSpeed;
    r.foe.isTranslucent = true;
    r.hit(r.fire('Ice Blast'));
    const immune = r.foe.characterSpeed;
    r.foe.isTranslucent = false;
    r.hit(r.fire('Ice Blast'));
    r.me.isDead = true;
    r.advance(5000);
    check('iceBlast:misc', { stacked, afterStack, immune, casterDead: r.foe.characterSpeed, defaults: r.foe.defaults.characterSpeed });
  });

  it('Entangling Vines: freezes target without colour change for 3000 ms; caster frozen 250 ms by doMelee', () => {
    const r = rig('Treenoc', 'Pax');
    const out: Record<string, unknown> = {};
    const ability = r.fire('Entangling Vines');
    out['casterAfterCast'] = { frozen: r.me.isFrozen, disabled: r.me.disableControls };
    r.hit(ability);
    out['target'] = { ...snap(r.foe), sprite: undefined, buff: r.foe.topHUD.buffs['Entangling Vines'], spriteColor: r.foe.has('SpriteColor') };
    r.advance(260);
    out['casterAt260'] = { frozen: r.me.isFrozen, disabled: r.me.disableControls };
    out['targetAt260'] = r.foe.isFrozen;
    r.advance(2800);
    out['targetExpired'] = { frozen: r.foe.isFrozen, disabled: r.foe.disableControls };
    r.foe.isTranslucent = true;
    r.me.abilitiesInfo['Entangling Vines'].lastUsed = 0;
    r.me.abilitiesInfo['Entangling Vines'].curCount = 0;
    r.hit(r.fire('Entangling Vines'));
    out['translucentImmune'] = r.foe.isFrozen;
    check('vines', out);
  });

  it('Entangling Vines: two hits do not stack; first expiry unfreezes while second is pending', () => {
    const r = rig('Treenoc', 'Pax');
    const a = r.fire('Entangling Vines');
    r.hit(a);
    r.advance(1000);
    r.hit(a);
    r.advance(2040);
    const afterFirstExpiry = r.foe.isFrozen;
    r.advance(1000);
    check('vines:double', { afterFirstExpiry, final: r.foe.isFrozen });
  });
});

describe('legacy abilities: heals', () => {
  it('Fire Heal: heals 10 x healMultiplier, capped at maxHealth', () => {
    const out: Record<string, unknown> = {};
    for (const mult of [1, 1.1, 2, 0]) {
      for (const hp of [10, 95, 100]) {
        const r = rig('Fiara');
        r.me.healMultiplier = mult;
        r.me.curHealth = hp;
        r.fire('Fire Heal');
        out[`${String(mult)}:${String(hp)}`] = { hp: f64(r.me.curHealth), lastUsed: r.me.abilitiesInfo['Fire Heal'].lastUsed - r.env.clock.now };
      }
    }
    check('fireHeal', out);
  });

  it('Steal Health: heals the caster by damage dealt (capped by remaining hp), once per cast', () => {
    const out: Record<string, unknown> = {};
    for (const [label, casterHp, foeHp, mult] of [
      ['wounded', 50, 100, 1], ['full', 100, 100, 1], ['foeLow', 50, 4, 1], ['healMult', 50, 100, 2], ['foeMult', 50, 100, 1],
    ] as const) {
      const r = rig('Wispera', 'Morblass');
      r.me.curHealth = casterHp;
      r.foe.curHealth = foeHp;
      r.me.healMultiplier = mult;
      if (label === 'foeMult') r.me.damageMultiplier = 3;
      const a = r.fire('Steal Health');
      r.hit(a);
      const first = { me: f64(r.me.curHealth), foe: f64(r.foe.curHealth) };
      r.hit(a);
      out[label] = { first, afterSecondHit: { me: r.me.curHealth, foe: r.foe.curHealth }, hasHit: a.hasHit };
    }
    const r = rig('Wispera', 'Morblass');
    r.foe.isTranslucent = true;
    r.me.curHealth = 50;
    r.hit(r.fire('Steal Health'));
    out['translucent'] = { me: r.me.curHealth, foe: r.foe.curHealth };
    check('stealHealth', out);
  });

  it('HealWithRest: benched character regains 0.5% maxHealth per second up to maxHealthWithRest', () => {
    const r = rig();
    const { Game } = r.env.globals as any;
    const bench = r.make('PlayerCharacter', 'Pax', 1, -1);
    Game.gameScene = { player: r.me };
    bench.curHealth = 50;
    bench.maxHealthWithRest = 51.2;
    const rest: any = r.env.crafty.e('HealWithRest');
    rest.doDelay(bench);
    const trace: number[] = [];
    for (let i = 0; i < 6; i++) {
      r.advance(1020);
      trace.push(bench.curHealth);
    }
    const destroyed = rest.destroyed;
    // not benched: the active player does not heal
    const active = r.make('PlayerCharacter', 'Pax', 0, 0);
    active.curHealth = 50;
    active.maxHealthWithRest = 100;
    Game.gameScene.player = active;
    (r.env.crafty.e('HealWithRest') as any).doDelay(active);
    r.advance(3060);
    // dead benched character does not heal
    const dead = r.make('PlayerCharacter', 'Pax', 0, 0);
    dead.curHealth = 50;
    dead.maxHealthWithRest = 100;
    dead.isDead = true;
    (r.env.crafty.e('HealWithRest') as any).doDelay(dead);
    r.advance(3060);
    check('healWithRest', {
      trace: trace.map(f64),
      destroyedAtCap: destroyed,
      activePlayerHp: active.curHealth,
      deadBenchedHp: dead.curHealth,
    });
  });
});

describe('legacy abilities: Hurricane ticks', () => {
  it('damages every >500 ms, halving each tick, and disappears after 3000 ms', () => {
    const r = rig('Echo', 'Pax');
    r.foe.curHealth = 1000;
    r.foe.maxHealth = 1000;
    const ability = r.fire('Hurricane');
    const trace: { t: number; hp: number }[] = [];
    const t0 = r.env.clock.now;
    let last = r.foe.curHealth;
    const out: Record<string, unknown> = {
      start: { x: ability.x, y: ability.y, w: ability.w, h: ability.h },
      delayAfterAttack: ability.delayAfterAttack,
      casterFrozen: r.me.isFrozen,
    };
    for (let t = 0; t < 3600 && !ability.destroyed; t += 20) {
      r.advance(20);
      if (!ability.destroyed) r.hit(ability);
      if (r.foe.curHealth !== last) {
        trace.push({ t: r.env.clock.now - t0, hp: r.foe.curHealth });
        last = r.foe.curHealth;
      }
    }
    out['hits'] = trace;
    out['destroyed'] = ability.destroyed;
    out['isDead'] = ability.isDead;
    out['alpha'] = f64(ability.alpha);
    out['rotation'] = ability.rotation;
    out['curCount'] = r.me.abilitiesInfo['Hurricane'].curCount;
    out['finalDamage'] = f64(ability.damage);
    check('hurricane', out);
  });

  it('follows the caster and is removed when the caster dies; translucent target is immune', () => {
    const r = rig('Echo', 'Pax');
    const ability = r.fire('Hurricane');
    r.me.x = 300;
    r.advance(20);
    const followed = { x: ability.x, y: ability.y };
    r.foe.isTranslucent = true;
    r.hit(ability);
    const immune = r.foe.curHealth;
    r.me.isDead = true;
    r.advance(20);
    check('hurricane:follow', { followed, immune, destroyed: ability.destroyed, curCount: r.me.abilitiesInfo['Hurricane'].curCount });
  });
});
