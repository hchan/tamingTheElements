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
});
