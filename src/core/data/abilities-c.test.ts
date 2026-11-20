import { describe, expect, it } from 'vitest';
import { ABILITIES_C } from './abilities-c';
import { ALL_ABILITIES } from './abilities-all';

const get = (id: string) => ABILITIES_C.find((a) => a.id === id);

describe('abilities-c tick values', () => {
  it('pins Forge Gore (Brazgor) to 100 cooldown ticks and 30 recovery ticks', () => {
    expect(get('forge-gore')?.cooldownTicks).toBe(100);
    expect(get('forge-gore')?.delayAfterAttackTicks).toBe(30);
  });

  it('pins Ember Bite recovery to 8 ticks (150 and 160 ms both round to 8)', () => {
    expect(get('ember-bite')?.delayAfterAttackTicks).toBe(8);
  });

  it('pins Abyss Flash to 12 recovery ticks (240 ms) and the other 250 ms recoveries to 13 (240 was not shipped: it moved Durrok out of band)', () => {
    expect(get('abyss-flash')?.delayAfterAttackTicks).toBe(12);
    for (const id of ['hoof-crash', 'kelp-lash', 'bristle-stomp']) {
      expect(get(id)?.delayAfterAttackTicks, id).toBe(13);
    }
  });

  it('pins the Ouroth kit boxes (Wyrm Coil 80x70, Scorch Breath 110x70, 90 cooldown ticks)', () => {
    expect([get('wyrm-coil')?.w, get('wyrm-coil')?.h]).toEqual([80, 70]);
    expect([get('scorch-breath')?.w, get('scorch-breath')?.h]).toEqual([110, 70]);
    expect(get('scorch-breath')?.cooldownTicks).toBe(90);
  });

  it('pins the Quarrak kit: Hurl Rock 40 damage at speed 8 (shares only damage and speed with Sonar Blast; box, cooldown differ: speed 7 pushed 1v1 out of band, 44 and 42 damage pushed 2v2 out), 25 cooldown ticks, 35x35 box; Boulder Roll 175 cooldown ticks, 64x48', () => {
    const rock = ALL_ABILITIES.find((a) => a.id === 'hurl-rock');
    expect([rock?.damage, rock?.speed, rock?.cooldownTicks]).toEqual([40, 8, 25]);
    expect([rock?.w, rock?.h]).toEqual([35 / 80, 35 / 80]);
    const roll = get('boulder-roll');
    expect([roll?.damage, roll?.speed, roll?.cooldownTicks]).toEqual([26, 4, 175]);
    expect([roll?.w, roll?.h]).toEqual([64 / 80, 48 / 80]);
  });

  it('pins the Umbrel kit: Spore Burst 6 damage at speed 5, 40x40 box, 70 cooldown ticks, wound 4 damage over 90 ticks; Mycelium Mend heal 8, 1500 cooldown ticks (no other ability shares kind, box, damage and speed; Mend differs from Fire Heal in heal 10 and 2000 ticks)', () => {
    const spore = ALL_ABILITIES.find((a) => a.id === 'spore-burst');
    expect([spore?.damage, spore?.speed, spore?.cooldownTicks]).toEqual([6, 5, 70]);
    expect([spore?.w, spore?.h]).toEqual([40 / 80, 40 / 80]);
    expect([spore?.woundDamage, spore?.woundTicks]).toEqual([4, 90]);
    const mend = get('mycelium-mend');
    expect([mend?.heal, mend?.cooldownTicks]).toEqual([8, 1500]);
  });

  it('pins the Nykra kit: Hoof Crash 20 damage, 50 cooldown ticks, 70x50 box; Kelp Lash 14 damage, 125 cooldown ticks, 130x30 box (no other ability shares box and damage; damage 18 or 17 and 13 pushed 1v1 or 2v2 out of band, see ideas/in-progress/roster24-nykra.md)', () => {
    const hoof = get('hoof-crash');
    expect([hoof?.damage, hoof?.cooldownTicks]).toEqual([20, 50]);
    expect([hoof?.w, hoof?.h]).toEqual([70, 50]);
    const kelp = get('kelp-lash');
    expect([kelp?.damage, kelp?.cooldownTicks]).toEqual([14, 125]);
    expect([kelp?.w, kelp?.h]).toEqual([130, 30]);
  });

  it('pins the Abyssor kit: Tentacle Lash 18 damage, 60 cooldown ticks, 160x30 box (no other ability has a 160 box; Kelp Lash is 130x30); Abyssal Pull 8 damage at speed 14, 300 cooldown ticks, stops at 280 px, pulls 120 px (the only body pull)', () => {
    const lash = get('tentacle-lash');
    expect([lash?.damage, lash?.cooldownTicks]).toEqual([18, 60]);
    expect([lash?.w, lash?.h]).toEqual([160, 30]);
    const pull = get('abyssal-pull');
    expect([pull?.damage, pull?.speed, pull?.cooldownTicks]).toEqual([8, 14, 300]);
    expect([pull?.hoverStopPx, pull?.pullPx]).toEqual([280, 120]);
  });
});
