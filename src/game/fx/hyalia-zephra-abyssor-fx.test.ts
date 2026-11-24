import { describe, expect, it } from 'vitest';
import { ALL_ABILITIES } from '@core/index';
import { BELL_SPRITE, BELL_TICKS, MOTE_SPEED, MOTE_SPRITE, MOTE_TICKS, PULL_DRAG, PULL_REACH, PULL_SPEED, PULL_SPRITE, PULL_TICKS, abyssalPull, bellPulse, staticMote } from './hyalia-zephra-abyssor-fx';

const def = (sprite: string) => ALL_ABILITIES.find((a) => a.sprite === sprite);

describe('hyalia / zephra / abyssor cast fx', () => {
  it('constants match the sim defs', () => {
    expect(def(MOTE_SPRITE)?.speed).toBe(MOTE_SPEED);
    expect(def(PULL_SPRITE)?.speed).toBe(PULL_SPEED);
    expect(def(PULL_SPRITE)?.hoverStopPx).toBe(PULL_REACH);
    expect(def(PULL_SPRITE)?.pullPx).toBe(PULL_DRAG);
    expect(def(BELL_SPRITE)).toBeDefined();
  });
  it('each is drawn while live and gone after its ticks', () => {
    expect(bellPulse(0, 0, 0, false)?.rings.length).toBeGreaterThanOrEqual(0);
    expect(bellPulse(0, 0, 10, false)?.rings.length).toBeGreaterThan(0);
    expect(bellPulse(0, 0, BELL_TICKS + 1, false)).toBeUndefined();
    expect(staticMote(0, 0, 0, 5, false)?.bolt.length).toBe(16);
    expect(staticMote(0, 0, 0, MOTE_TICKS + 1, false)).toBeUndefined();
    expect(abyssalPull(0, 0, 0, 5, false)?.tendril.length).toBe(30);
    expect(abyssalPull(0, 0, 0, PULL_TICKS + 1, false)).toBeUndefined();
  });
  it('bell rings widen over time', () => {
    const early = bellPulse(0, 0, 4, false)?.rings[0]?.r ?? 0;
    const late = bellPulse(0, 0, 20, false)?.rings[0]?.r ?? 0;
    expect(late).toBeGreaterThan(early);
  });
  it('mote flies the way the caster faces', () => {
    expect(staticMote(0, 0, 0, 10, false)?.head.x).toBeGreaterThan(0);
    expect(staticMote(0, 0, 4, 10, false)?.head.x).toBeLessThan(0);
  });
  it('pull lashes out to its reach, then hauls back', () => {
    const tipX = (age: number): number => abyssalPull(0, 0, 0, age, false)?.tip.x ?? 0;
    expect(tipX(10)).toBeGreaterThan(tipX(4));
    expect(tipX(20)).toBeGreaterThan(PULL_REACH * 0.9);
    expect(tipX(PULL_TICKS)).toBeLessThan(tipX(20) - PULL_DRAG / 2);
    expect(abyssalPull(0, 0, 4, 10, false)?.tip.x).toBeLessThan(0);
  });
  it('reduced motion holds still', () => {
    expect(bellPulse(5, 5, 1, true)).toEqual(bellPulse(5, 5, 20, true));
    expect(staticMote(5, 5, 0, 1, true)).toEqual(staticMote(5, 5, 0, 20, true));
    expect(abyssalPull(5, 5, 0, 1, true)).toEqual(abyssalPull(5, 5, 0, 20, true));
  });
});
