import { describe, expect, it } from 'vitest';
import { ABILITIES_C } from './abilities-c';

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
});
