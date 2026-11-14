import { describe, expect, it } from 'vitest';
import { ABILITIES_A, ABILITIES_B, CHARACTERS, Cmd, type RenderActionBar } from '@core/index';
import { abilityNameOfSprite, abilityShortOfSprite, trapNameOfElement, trapShortOfElement, trapTextOfElement } from './kit-names';
import { abilityNote, buildSlots, slotTip, trapNote, DEFAULT_KEY_LABELS, type ArcadeBar } from './action-bar';

const SPRITES: Record<string, string> = Object.fromEntries([...ABILITIES_A, ...ABILITIES_B].map((d) => [d.id, d.sprite]));
const bar = (a: string, b: string, kind: number): RenderActionBar => ({
  tick: 100,
  abilities: [
    { sprite: SPRITES[a] ?? '', readyTick: 0, cooldownTicks: 50 },
    { sprite: SPRITES[b] ?? '', readyTick: 250, cooldownTicks: 500 },
  ],
  capture: undefined, swaps: [], swapReadyTick: 0, swapCooldownTicks: 250,
  trap: { readyTick: 0, cooldownTicks: 500, count: 0, max: 2 },
  elemental: { name: 'Ember', kind, readyTick: 0, cooldownTicks: 100, activeUntil: 0 },
});
const arc: ArcadeBar = { meter: 0, weatherCharge: 0, guard: 0, guarding: false, dashIn: 0, chargeIn: -1, cleanseIn: 0, keepCharge: false };

describe('kit names', () => {
  it('every real hero ability has a full name and a short label that fits a strip (<= 10 chars)', () => {
    for (const c of CHARACTERS) {
      if (c.element === 'void') continue;
      for (const id of c.abilities) {
        const sprite = SPRITES[id];
        if (sprite === undefined) continue;
        expect(abilityNameOfSprite(sprite), id).toBeTruthy();
        expect((abilityShortOfSprite(sprite) ?? '').length, id).toBeLessThanOrEqual(10);
      }
    }
  });
  it('unknown or empty sprites give nothing, so the generic words stay', () => {
    expect(abilityNameOfSprite('')).toBeUndefined();
    expect(abilityShortOfSprite('nope')).toBeUndefined();
    expect(abilityNote('nope', 0, 0)).toEqual({});
  });
  it('the trap is named for the hero element', () => {
    expect([1, 2, 3, 4].map(trapNameOfElement)).toEqual(['Fire Bomb', 'Puddle', 'Spike', 'Gust']);
    expect([1, 2, 3, 4].map(trapShortOfElement)).toEqual(['Bomb', 'Puddle', 'Spike', 'Gust']);
    expect(trapNameOfElement(0)).toBe('Trap');
    expect(trapNameOfElement(undefined)).toBe('Trap');
    expect(trapTextOfElement(2)).toMatch(/puddle/i);
    expect(trapTextOfElement(0)).toBeUndefined();
  });
  it('trapNote keeps the count and cooldown words under the trap name', () => {
    const t = { readyTick: 150, count: 1, max: 2 };
    expect(trapNote(100, t, 'Puddle')).toBe('Puddle 1s');
    expect(trapNote(100, { ...t, readyTick: 0 }, 'Puddle')).toBe('Puddle 1/2');
    expect(trapNote(100, { ...t, readyTick: 0, count: 2 }, 'Gust')).toBe('Gust full');
  });
  it('the Arcade bar words each ability with its own name and seconds left, and the trap with its own name', () => {
    const slots = buildSlots(bar('ice-shock', 'shards-of-ice', 2), DEFAULT_KEY_LABELS, arc);
    const [a, b] = slots.filter((s) => s.kind === 'ability');
    expect([a?.note, b?.note]).toEqual(['Ice Shock', 'Shards 3s']);
    const trap = slots.find((s) => s.kind === 'trap');
    expect(trap?.note).toBe('Puddle 0/2');
    expect(trap?.element).toBe(2);
    expect(slotTip({ kind: 'ability', cmd: Cmd.secondary, sprite: b?.sprite ?? '' }).title).toBe('Shards of Ice');
    expect(slotTip({ kind: 'trap', cmd: Cmd.trap, element: 2 }).title).toBe('Puddle');
  });
  it('the non-Arcade bar keeps the generic words', () => {
    const slots = buildSlots(bar('ice-shock', 'shards-of-ice', 2));
    expect(slots.find((s) => s.kind === 'trap')?.note).toBe('Trap 0/2');
    expect(slots.find((s) => s.kind === 'ability')?.note).toBe('');
  });
});
