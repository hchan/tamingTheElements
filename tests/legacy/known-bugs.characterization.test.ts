import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLegacy, type LegacyEnv } from '@testing/legacy/load-legacy';

/**
 * Characterization of the known legacy bugs (docs/legacy/KNOWN-BUGS.md). Every test asserts the
 * CURRENT (buggy) behaviour with a plain `it`, tagged with its slug. Scenarios are scripted inside
 * the legacy vm context and observed as JSON.
 */

const SRC_DIR = resolve(import.meta.dirname, '../../war/WEB-INF/private/src');

/** Runs `body` (function body source) in the legacy context and returns its JSON-serialisable result. */
function observe(env: LegacyEnv, body: string): Record<string, unknown> {
  const json = env.run(`JSON.stringify((function () {\n${body}\n})())`) as string;
  return JSON.parse(json) as Record<string, unknown>;
}

/** Legacy-side helpers shared by the scenarios. */
const PRELUDE = `
  function fighter(kind, props) {
    var e = Crafty.e(kind);
    for (var k in props) e[k] = props[k];
    e.pauseAnimation = function () {};
    e.resumeAnimation = function () {};
    return e;
  }
  function info() { return { curCount: 0, lastUsed: 0 }; }
`;

describe('known legacy bugs (current behaviour)', () => {
  it('pause-vs-date: a cooldown keeps elapsing while Crafty is paused', () => {
    // KNOWN-BUG:pause-vs-date
    const env = loadLegacy({ seed: 1 });
    env.run(`${PRELUDE}; var pp = fighter('PlayerCharacter', { abilitiesInfo: { 'Fire Blast': info() } });
      pp.abilitiesInfo['Fire Blast'].lastUsed = new Date().getTime(); Crafty.pause();`);
    expect(env.run(`pp.canFire('Fire Blast')`)).toBe(false);
    env.clock.advance(601);
    expect(env.run(`Crafty.isPaused()`)).toBe(true);
    expect(env.run(`pp.canFire('Fire Blast')`)).toBe(true);
  });

  it('death-in-hud: hp <= 0 does not set isDead until topHUD.refresh runs', () => {
    // KNOWN-BUG:death-in-hud
    const env = loadLegacy({ seed: 1 });
    const result = observe(
      env,
      `${PRELUDE}
      var p = fighter('PlayerCharacter', { isDead: false, curHealth: 100, maxHealth: 100,
        elementalType: 'fire', damageMultiplier: 1 });
      var e = fighter('EnemyCharacter', { isDead: false, curHealth: 100, maxHealth: 100,
        elementalType: 'fire', damageMultiplier: 1 });
      p.targetPlayer = e; e.targetPlayer = p;
      Game.params = { heroes: [{ character: p }], opponents: [{ character: e }] };
      var hud = Crafty.e('topHUD');
      var ctx = new Proxy({}, { get: function (t, k) { return function () {}; } });
      TopHUD.topHUDCanvasJqueryObj = [{ getContext: function () { return ctx; } }];
      hud.character = p; hud.benchSpriteEntities = []; hud.x_offset = 0; hud.y_offset = 0;
      hud.minHealthPixelX = 0; hud.maxHealthPixelX = 100;
      hud.drawBuffBar = function () {};
      p.applyDamage(1000);
      var afterDamage = { hp: p.curHealth, isDead: p.isDead, mult: p.damageMultiplier };
      hud.refresh();
      return { afterDamage: afterDamage, afterRefresh: { isDead: p.isDead, mult: p.damageMultiplier } };`,
    );
    expect(result).toEqual({
      afterDamage: { hp: -900, isDead: false, mult: 1 },
      afterRefresh: { isDead: true, mult: 0 },
    });
  });

  it('capture-ignores-fade: Capture succeeds against a faded target while a normal bullet does not', () => {
    // KNOWN-BUG:capture-ignores-fade
    const env = loadLegacy({ seed: 1 });
    const result = observe(
      env,
      `${PRELUDE}
      var p = fighter('PlayerCharacter', { isDead: false, direction: 'e', targetPlayerType: 'EnemyCharacter',
        abilitiesInfo: { 'Capture': info(), 'Fire Blast': info() }, elementalType: 'fire', damageMultiplier: 1 });
      var t = fighter('EnemyCharacter', { isDead: false, isTranslucent: true, isCaptured: false,
        characterName: 'Pax', curHealth: 100, maxHealth: 100, elementalType: 'fire', damageMultiplier: 1 });
      p.targetPlayer = t; t.targetPlayer = p;
      // normal bullet vs. faded target
      var blast = Crafty.e('Fire Blast'); blast.initAbility(p);
      var blastCb = blast.hitHandlers[blast.hitHandlers.length - 1].cb;
      blastCb.call(blast, [{ obj: t }]);
      var afterBlast = { hp: t.curHealth, captured: t.isCaptured };
      // capture vs. faded target
      var cap = Crafty.e('Capture'); cap.initAbility(p);
      cap.hitHandlers[cap.hitHandlers.length - 1].cb.call(cap, [{ obj: t }]);
      return { afterBlast: afterBlast, translucent: t.isTranslucent, captured: t.isCaptured,
        hpAfterCapture: t.curHealth < 0 };`,
    );
    expect(result).toEqual({
      afterBlast: { hp: 100, captured: false },
      translucent: true,
      captured: true,
      hpAfterCapture: false, // captured flag set, but no damage: the translucency check lives in the skipped default callback
    });
  });

  it('vines-stacking: two hits stack; the first expiry unfreezes while the second should still hold', () => {
    // KNOWN-BUG:vines-stacking
    const env = loadLegacy({ seed: 1 });
    env.run(`${PRELUDE}
      var p = fighter('PlayerCharacter', { isDead: false, direction: 'e', targetPlayerType: 'EnemyCharacter',
        abilitiesInfo: { 'Entangling Vines': info() }, elementalType: 'earth', damageMultiplier: 1 });
      var t = fighter('EnemyCharacter', { isDead: false, isTranslucent: false, isFrozen: false,
        topHUD: { buffs: {} }, curHealth: 100, maxHealth: 100, elementalType: 'fire', damageMultiplier: 1,
        x: 0, y: 0, w: 80, h: 80 });
      t.unbind('EnterFrame'); // keep the enemy AI out of this scenario
      p.targetPlayer = t; t.targetPlayer = p;
      var vines = Crafty.e('Entangling Vines'); vines.initAbility(p);
      var hit = vines.hitHandlers[vines.hitHandlers.length - 1].cb;
      hit.call(vines, [{ obj: t }]);`);
    expect(env.run('t.isFrozen')).toBe(true);
    env.clock.advance(1000);
    env.run('hit.call(vines, [{ obj: t }])'); // second hit 1 s later
    expect(env.run('t.isFrozen')).toBe(true);
    env.clock.advance(2030); // t = 3030: first expiry (frames are 20 ms apart)
    expect(env.run('t.isFrozen')).toBe(false); // unfrozen although the second hit lasts until 4000
    env.clock.advance(1000); // t = 4030: second expiry changes nothing
    expect(env.run('t.isFrozen')).toBe(false);
  });

  it('vines-stacking: if the caster dies before expiry the target is never unfrozen', () => {
    // KNOWN-BUG:vines-stacking
    const env = loadLegacy({ seed: 1 });
    env.run(`${PRELUDE}
      var p = fighter('PlayerCharacter', { isDead: false, direction: 'e', targetPlayerType: 'EnemyCharacter',
        abilitiesInfo: { 'Entangling Vines': info() }, elementalType: 'earth', damageMultiplier: 1 });
      var t = fighter('EnemyCharacter', { isDead: false, isTranslucent: false, isFrozen: false,
        topHUD: { buffs: {} }, curHealth: 100, maxHealth: 100, elementalType: 'fire', damageMultiplier: 1,
        x: 0, y: 0, w: 80, h: 80 });
      t.unbind('EnterFrame'); // keep the enemy AI out of this scenario
      p.targetPlayer = t; t.targetPlayer = p;
      var vines = Crafty.e('Entangling Vines'); vines.initAbility(p);
      vines.hitHandlers[vines.hitHandlers.length - 1].cb.call(vines, [{ obj: t }]);
      p.isDead = true;`);
    env.clock.advance(5000);
    expect(env.run('t.isFrozen')).toBe(true);
  });

  describe('router-main-hash', () => {
    const route = (hash: string, spy: string): { called: string[]; error: string | null } => {
      const env = loadLegacy({ seed: 1 });
      const called: string[] = [];
      env.globals.Main[spy] = () => {
        called.push(spy);
      };
      env.dom.window.location.hash = hash;
      let error: string | null = null;
      try {
        env.run('Main.beginAfterLoad()');
      } catch (e) {
        error = (e as Error).message;
      }
      return { called, error };
    };

    it('#exit, #gameMaster and #newGame invoke Main[...] directly', () => {
      // KNOWN-BUG:router-main-hash
      for (const name of ['exit', 'gameMaster', 'newGame']) {
        expect(route(`#${name}`, name), name).toEqual({ called: [name], error: null });
      }
    });

    it('an unknown hash and #constructor are handled by the same lookup', () => {
      // KNOWN-BUG:router-main-hash
      expect(route('#doesNotExist', 'exit').error).toMatch(/is not a function/);
      // Object.prototype.constructor is callable as a method, so it does not throw (the plan guessed it would).
      expect(route('#constructor', 'exit')).toEqual({ called: [], error: null });
      expect(route('#hasInitOnce', 'exit').error).toMatch(/is not a function/);
    });
  });

  it('garrison-sort-ignored: the saved sort order never changes the garrison order', () => {
    // KNOWN-BUG:garrison-sort-ignored
    const env = loadLegacy({ seed: 1, jquery: { vals: {} } });
    env.run(`GamePersist.saveStart();
      Garrison.addGarrisonCharacter({ experience: 1, characterName: 'Zed' });
      Garrison.addGarrisonCharacter({ experience: 4, characterName: 'Abe' });`);
    const names = (): string[] => JSON.parse(env.run(
      `JSON.stringify(Garrison.getGarrison().map(function (g) { return g.characterName; }))`,
    ) as string) as string[];
    const before = names();
    for (const order of ['1', '2', '3']) {
      env.jquery.vals["#settings input[name='garrisonSortOrder']:checked"] = order;
      env.run('Settings.save()');
      expect(env.run('GamePersist.getGameState().garrisonSortOrder')).toBe(order);
      expect(names()).toEqual(before);
    }
    // garrison.js (list building and persistence) never reads the setting.
    expect(readFileSync(resolve(SRC_DIR, 'garrison.js'), 'utf8')).not.toContain('garrisonSortOrder');
  });

  it('garrison-max-size-unenforced: an 11th garrison character is accepted', () => {
    // KNOWN-BUG:garrison-max-size-unenforced
    const env = loadLegacy({ seed: 1 });
    env.run('GamePersist.saveStart()');
    expect(env.run('Garrison.MAX_SIZE')).toBe(10);
    for (let i = 0; i < 10; i++)
      env.run(`Garrison.addGarrisonCharacter({ experience: 1, characterName: 'C${String(i)}' })`);
    expect(env.run('Garrison.getGarrison().length')).toBe(11);
  });

  it('bounds-y-typo: resetIfOutOfBounds reads this.Y so y is never restored from the questionable value', () => {
    // KNOWN-BUG:bounds-y-typo
    const env = loadLegacy({ seed: 1 });
    const result = observe(
      env,
      `${PRELUDE}
      var c = fighter('EnemyCharacter', {});
      c.x = 10; c.y = 20; c.previousX = 1; c.previousY = 2;
      c.hit = function () { return this.x >= 10; }; // solid to the right of x = 10
      c.resetIfOutOfBounds();
      var onlyX = { x: c.x, y: c.y, capitalY: c.Y === undefined };
      var d = fighter('EnemyCharacter', {});
      d.x = 10; d.y = 20; d.previousX = 1; d.previousY = 2;
      d.hit = function () { return this.y >= 20 || this.x >= 10; }; // x alone cannot free it
      d.resetIfOutOfBounds();
      return { onlyX: onlyX, both: { x: d.x, y: d.y } };`,
    );
    // x is restored to previousX; the colliding y is left as it was (no questionableY is ever written back).
    expect(result).toEqual({ onlyX: { x: 1, y: 20, capitalY: true }, both: { x: 1, y: 2 } });
  });

  it('damage-uses-target-mult: applyDamage scales by the victim target damageMultiplier, not the hitter', () => {
    // KNOWN-BUG:damage-uses-target-mult
    const env = loadLegacy({ seed: 1 });
    const result = observe(
      env,
      `${PRELUDE}
      var hitter = fighter('EnemyCharacter', { elementalType: 'fire', damageMultiplier: 3, curHealth: 100, maxHealth: 100 });
      var stale = fighter('PlayerCharacter', { elementalType: 'fire', damageMultiplier: 0.5, curHealth: 100, maxHealth: 100 });
      var victim = fighter('PlayerCharacter', { elementalType: 'fire', damageMultiplier: 1, curHealth: 100, maxHealth: 100 });
      victim.targetPlayer = stale; // after a swap the victim still targets the old character
      var dealt = victim.applyDamage(10);
      return { dealt: dealt, hitterMult: hitter.damageMultiplier, hp: victim.curHealth };`,
    );
    // 10 * 0.5 (stale target) rather than 10 * 3 (the hitter).
    expect(result).toEqual({ dealt: 5, hitterMult: 3, hp: 95 });
  });

  it('prod-cheats: Shift-Q, Shift-X and Shift-C are live in the production key handler', () => {
    // KNOWN-BUG:prod-cheats
    const env = loadLegacy({ seed: 1 });
    expect(Object.keys(env.globals.Input['types'] as object)).toEqual(
      expect.arrayContaining(['I Win', 'Freeze', 'CaptureWin']),
    );
    env.run(`Crafty.scene = function () {}; Game.start();`);
    const result = observe(
      env,
      `var calls = [];
      var enemy = { isFrozen: false, isCaptured: false, applyDamage: function (d) { calls.push(d === Number.MAX_VALUE ? 'MAX' : d); } };
      Game.gameScene = { enemy: enemy };
      function key(code) { document.onkeydown({ keyCode: Crafty.keys[code], shiftKey: true, ctrlKey: false, stopPropagation: function () {} }); }
      key('Q'); var q = { calls: calls.slice(), frozen: enemy.isFrozen, captured: enemy.isCaptured };
      key('X'); var x = { calls: calls.slice(), frozen: enemy.isFrozen, captured: enemy.isCaptured };
      key('C'); var c = { calls: calls.slice(), frozen: enemy.isFrozen, captured: enemy.isCaptured };
      return { q: q, x: x, c: c };`,
    );
    expect(result).toEqual({
      q: { calls: ['MAX'], frozen: false, captured: false },
      x: { calls: ['MAX'], frozen: true, captured: false },
      c: { calls: ['MAX', 'MAX'], frozen: true, captured: true },
    });
  });
});
