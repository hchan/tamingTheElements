import { describe, expect, it } from 'vitest';
import { ABILITIES_C } from './abilities-c';
import { ALL_ABILITIES } from './abilities-all';
import { CHARACTERS } from './characters';
import { HIT_STRENGTH_OVERRIDE, HitStrength } from './arcade';

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

  it('pins the Glimmaw kit: Lure Orb 14 damage at speed 6, 60 cooldown ticks, max 2, 28x28 box, hover 360 px for 80 ticks; Abyss Flash 6 damage, 300 cooldown ticks, 12 recovery ticks, centred 100x100 box (no other ability shares kind, box and damage; see ideas/in-progress/roster24-glimmaw.md)', () => {
    const orb = get('lure-orb');
    expect([orb?.damage, orb?.speed, orb?.cooldownTicks, orb?.maxActive]).toEqual([14, 6, 60, 2]);
    expect([orb?.w, orb?.h]).toEqual([28 / 80, 28 / 80]);
    expect([orb?.hoverStopPx, orb?.hoverLingerTicks]).toEqual([360, 80]);
    const flash = get('abyss-flash');
    expect([flash?.damage, flash?.cooldownTicks, flash?.delayAfterAttackTicks]).toEqual([6, 300, 12]);
    expect([flash?.w, flash?.h, flash?.centred]).toEqual([100, 100, true]);
    for (const a of [orb, flash].flatMap((x) => (x ? [x] : []))) {
      const twins = ALL_ABILITIES.filter(
        (o) => o.id !== a.id && o.kind === a.kind && o.w === a.w && o.h === a.h && o.damage === a.damage,
      );
      expect(twins.map((t) => t.id), a.id).toEqual([]);
    }
  });

  it('pins the Durrok kit: Tusk Gore 22 damage, 3000 ms cooldown, 80x50 box, 180 px lunge; Bristle Stomp 15 damage, 70x40 box (no other ability shares kind, box and damage with either)', () => {
    const gore = get('tusk-gore');
    const stomp = get('bristle-stomp');
    if (!gore || !stomp) throw new Error('Durrok abilities missing');
    expect([gore.damage, gore.w, gore.h, gore.lungePx]).toEqual([22, 80, 50, 180]);
    expect([stomp.damage, stomp.w, stomp.h]).toEqual([15, 70, 40]);
    for (const mine of [gore, stomp]) {
      const twins = ALL_ABILITIES.filter(
        (a) => a.id !== mine.id && a.kind === mine.kind && a.w === mine.w && a.h === mine.h && a.damage === mine.damage,
      );
      expect(twins.map((a) => a.id)).toEqual([]);
    }
  });

  it('pins the Zephra kit: Static Mote 8 damage at speed 10, 16x16 box, 20 cooldown ticks, max 3 (no other ability shares its box; Abyssal Pull shares only damage); Skitter 150 cooldown ticks, 140 px backward lunge, no damage', () => {
    const mote = get('static-mote');
    expect([mote?.damage, mote?.speed, mote?.cooldownTicks, mote?.maxActive]).toEqual([8, 10, 20, 3]);
    expect([mote?.w, mote?.h]).toEqual([16 / 80, 16 / 80]);
    const hop = get('skitter');
    expect([hop?.cooldownTicks, hop?.lungePx, hop?.damage ?? 0]).toEqual([150, -140, 0]);
    const sameBox = ALL_ABILITIES.filter((a) => a.id !== 'static-mote' && a.w === mote?.w && a.h === mote?.h);
    expect(sameBox.map((a) => a.id)).toEqual([]);
  });
  it('pins the Hyalia kit: 99 max health (95 gave 42.1 percent 1v1; 102 gave 57.4 percent 2v2); Stinging Filament 10 damage at speed 12, 110x10 box (scaled), 45 cooldown ticks, max 2; Bell Pulse omni 6 damage at speed 5, 24x24 box (scaled), 250 cooldown ticks (no other ability shares kind, box and damage with either)', () => {
    expect(CHARACTERS.find((c) => c.id === 'hyalia')?.maxHealth).toBe(99);
    const sting = get('stinging-filament');
    expect([sting?.damage, sting?.speed, sting?.cooldownTicks, sting?.maxActive]).toEqual([10, 12, 45, 2]);
    expect([sting?.w, sting?.h]).toEqual([110 / 80, 10 / 80]);
    const bell = get('bell-pulse');
    expect([bell?.damage, bell?.speed, bell?.cooldownTicks, bell?.maxActive]).toEqual([6, 5, 250, 1]);
    expect([bell?.w, bell?.h]).toEqual([24 / 80, 24 / 80]);
    for (const a of [sting, bell].flatMap((x) => (x ? [x] : []))) {
      const twins = ALL_ABILITIES.filter(
        (o) => o.id !== a.id && o.kind === a.kind && o.w === a.w && o.h === a.h && o.damage === a.damage,
      );
      expect(twins.map((t) => t.id), a.id).toEqual([]);
    }
  });
  it('pins the Vortigal kit: Stoop melee 22 damage, 175 cooldown ticks, 90x60 box, lunge 200; Talon Rake melee 12 damage, 45 cooldown ticks, max 2, 60x40 box (no other ability shares kind, box and damage with either)', () => {
    const stoop = get('stoop');
    expect([stoop?.kind, stoop?.damage, stoop?.cooldownTicks, stoop?.maxActive, stoop?.w, stoop?.h, stoop?.lungePx]).toEqual(['melee', 22, 175, 1, 90, 60, 200]);
    const rake = get('talon-rake');
    expect([rake?.kind, rake?.damage, rake?.cooldownTicks, rake?.maxActive, rake?.w, rake?.h]).toEqual(['melee', 12, 45, 2, 60, 40]);
    for (const a of [stoop, rake].flatMap((x) => (x ? [x] : []))) {
      const twins = ALL_ABILITIES.filter(
        (o) => o.id !== a.id && o.kind === a.kind && o.w === a.w && o.h === a.h && o.damage === a.damage,
      );
      expect(twins.map((t) => t.id), a.id).toEqual([]);
    }
  });
  it('pins the Kindrel kit: Ember Bite melee 8 damage, 340 ms cooldown, max 3, 48x34 box, forced light hit; Cinder Spray omni 8 damage at speed 6, 20x20 box (scaled), 4000 ms cooldown (no other ability shares kind, box and damage with either)', () => {
    const bite = get('ember-bite');
    expect([bite?.kind, bite?.damage, bite?.cooldownTicks, bite?.maxActive]).toEqual(['melee', 8, 17, 3]);
    expect([bite?.w, bite?.h]).toEqual([48, 34]);
    expect(HIT_STRENGTH_OVERRIDE['ember-bite']).toBe(HitStrength.light);
    const spray = get('cinder-spray');
    expect([spray?.kind, spray?.damage, spray?.speed, spray?.cooldownTicks, spray?.maxActive]).toEqual(['omni', 8, 6, 200, 1]);
    expect([spray?.w, spray?.h]).toEqual([20 / 80, 20 / 80]);
    for (const a of [bite, spray].flatMap((x) => (x ? [x] : []))) {
      const twins = ALL_ABILITIES.filter(
        (o) => o.id !== a.id && o.kind === a.kind && o.w === a.w && o.h === a.h && o.damage === a.damage,
      );
      expect(twins.map((t) => t.id), a.id).toEqual([]);
    }
  });
});
