import { describe, expect, it } from 'vitest';
import { Cmd, type RenderActionBar } from '@core/index';
import { BAR_Y, MIRROR_SIDE, mirrorSlots, shortLabels, ELEMENTAL_LABEL, TRAP_LABEL, elementSymbol, trapGlyph, fitTextScale, elementalNote, trapNote, CAPTURE_NOTICE_TICKS, SLOT_SIDE, buildSlots, captureHint, commandAt, cooldownProgress, cooldownSweep, labelsFromBindings } from './action-bar';
import { bindSteal, DEFAULT_BINDINGS } from '../platform/input/bindings';

const bar = (over: Partial<RenderActionBar> = {}): RenderActionBar => ({
  tick: 100,
  abilities: [
    { sprite: 'a', readyTick: 0, cooldownTicks: 50 },
    { sprite: 'b', readyTick: 125, cooldownTicks: 49 },
  ],
  capture: { sprite: 'c', readyTick: 0, cooldownTicks: 10, capturable: false },
  swaps: [
    { sprite: 'x', dead: false },
    { sprite: 'y', dead: true },
  ],
  swapReadyTick: 100,
  swapCooldownTicks: 250,
  trap: undefined,
  elemental: undefined,
  ...over,
});

describe('Trap slot', () => {
  const t = { readyTick: 100, cooldownTicks: 500, count: 1, max: 2 };
  it('comes after the swaps with its own key label (not Capture\'s)', () => {
    const slots = buildSlots(bar({ trap: t }));
    const last = slots[slots.length - 1];
    expect([last?.kind, last?.cmd, last?.label, last?.note]).toEqual(['trap', Cmd.trap, 'Z', 'Trap 1/2']);
    expect(slots[2]?.label).toBe('C');
    expect(labelsFromBindings(DEFAULT_BINDINGS)[TRAP_LABEL]).toBe('Z');
  });
  it('says the seconds left while cooling and "full" at the cap', () => {
    expect(trapNote(100, { ...t, readyTick: 151 })).toBe('Trap 2s');
    expect(trapNote(100, { ...t, readyTick: 350 })).toBe('Trap 5s');
    expect(trapNote(100, { ...t, count: 2 })).toBe('Trap full');
  });
  it('a click emits the trap command bit', () => {
    const slots = buildSlots(bar({ trap: t }));
    const last = slots[slots.length - 1];
    expect(commandAt(slots, (last?.x ?? 0) + 5, (last?.y ?? 0) + 5)).toBe(Cmd.trap);
  });
});

describe('Element slot (FUN-DESIGN 2.24)', () => {
  const e = { name: 'Ember', kind: 1, readyTick: 100, cooldownTicks: 1750, activeUntil: 0 };
  const t = { readyTick: 100, cooldownTicks: 500, count: 0, max: 2 };
  it('comes last with its own key label (V, not a swap\'s) and emits the elemental bit', () => {
    const slots = buildSlots(bar({ trap: t, elemental: e }));
    const last = slots[slots.length - 1];
    expect([last?.kind, last?.cmd, last?.label, last?.note, last?.element]).toEqual(['elemental', Cmd.elemental, 'V', 'Ember', 1]);
    expect(labelsFromBindings(DEFAULT_BINDINGS)[ELEMENTAL_LABEL]).toBe('V');
    expect(commandAt(slots, (last?.x ?? 0) + 5, (last?.y ?? 0) + 5)).toBe(Cmd.elemental);
  });
  it('says "on" while the buff runs (highlighted), then the seconds left, then the name', () => {
    expect(elementalNote(100, { ...e, readyTick: 1850, activeUntil: 350 })).toBe('Ember on');
    expect(elementalNote(400, { ...e, readyTick: 1850, activeUntil: 350 })).toBe('Ember 29s');
    expect(elementalNote(1850, { ...e, readyTick: 1850 })).toBe('Ember');
    expect(buildSlots(bar({ trap: t, elemental: { ...e, activeUntil: 101 } })).at(-1)?.highlight).toBe(true);
  });
  it('an Arcade bar never shows a fourth swap slot (bit 10 is the elemental ability there)', () => {
    const swaps = [{ sprite: 'w', dead: false }, { sprite: 'x', dead: false }, { sprite: 'y', dead: false }, { sprite: 'z', dead: false }];
    expect(buildSlots(bar({ swaps })).filter((s) => s.cmd === Cmd.swap4)).toHaveLength(1);
    expect(buildSlots(bar({ swaps, trap: t })).filter((s) => s.kind === 'swap')).toHaveLength(3);
  });
  it('draws the alchemical symbols: fire and air point up, water and earth down, air and earth barred', () => {
    expect(elementSymbol(1, 0, 0, 10)).toEqual({ tri: [0, -10, 10, 10, -10, 10], bar: undefined });
    expect(elementSymbol(2, 0, 0, 10).tri[1]).toBe(10);
    expect(elementSymbol(3, 0, 0, 9).bar).toEqual([-9, 3, 9, 3]);
    expect(elementSymbol(4, 0, 0, 9).bar).toEqual([-9, -3, 9, -3]);
  });
});

describe('cooldownProgress', () => {
  it('is 1 when ready and rises to 1 across the cooldown', () => {
    expect(cooldownProgress(100, 100, 50)).toBe(1);
    expect(cooldownProgress(100, 151, 50)).toBe(0);
    expect(cooldownProgress(100, 125, 49)).toBe(0.5);
  });
});

describe('cooldownSweep (legacy drawCooldown)', () => {
  it('starts as the full square from top-centre and ends as a thin wedge', () => {
    expect(cooldownSweep(0, 0, 0, 80)).toEqual([40, 0, 40, 40, 40, 0, 80, 0, 80, 80, 0, 80, 0, 0]);
    expect(cooldownSweep(0.5, 0, 0, 80)).toEqual([40, 0, 40, 40, 40, 80, 0, 80, 0, 0]);
    expect(cooldownSweep(0.9375, 0, 0, 80)).toEqual([40, 0, 40, 40, 20, 0]);
  });
});

describe('mirror readout (Player 2 in local Versus)', () => {
  it('re-lays the slots small, right-aligned, clear of the main bar and inside the screen', () => {
    const slots = buildSlots(bar());
    const m = mirrorSlots(slots);
    expect(m.map((s) => s.cmd)).toEqual(slots.map((s) => s.cmd));
    expect(m.map((s) => s.progress)).toEqual(slots.map((s) => s.progress));
    for (const s of m) {
      expect(s.size).toBe(MIRROR_SIDE);
      expect(s.y + s.size).toBeLessThanOrEqual(BAR_Y);
      expect(s.x).toBeGreaterThanOrEqual(0);
    }
    const last = m[m.length - 1];
    expect(last && last.x + last.size).toBeLessThanOrEqual(1280);
    for (let i = 1; i < m.length; i++) expect((m[i]?.x ?? 0) - ((m[i - 1]?.x ?? 0) + MIRROR_SIDE)).toBeGreaterThan(0);
    expect(mirrorSlots([])).toEqual([]);
  });

  it('shortens punctuation key labels so they fit a small slot', () => {
    expect(shortLabels({ 1: 'Semicolon', 2: 'Period', 3: 'Comma', 4: 'U' })).toEqual({ 1: ';', 2: '.', 3: ',', 4: 'U' });
  });
});

describe('buildSlots', () => {
  it('orders primary, secondary, capture, swaps and labels them from the key map', () => {
    const slots = buildSlots(bar());
    expect(slots.map((s) => [s.kind, s.cmd, s.label])).toEqual([
      ['ability', Cmd.primary, '1'],
      ['ability', Cmd.secondary, '2'],
      ['capture', Cmd.capture, 'C'],
      ['swap', Cmd.swap1, '3'],
      ['swap', Cmd.swap2, '4'],
    ]);
    expect(slots[1]?.progress).toBe(0.5);
    expect(slots[2]?.disabled).toBe(true);
    expect(slots[4]?.disabled).toBe(true);
  });
  it('omits capture when not granted and highlights it when capturable and ready', () => {
    expect(buildSlots(bar({ capture: undefined })).map((s) => s.kind)).not.toContain('capture');
    const c = buildSlots(bar({ capture: { sprite: 'c', readyTick: 0, cooldownTicks: 10, capturable: true } }))[2];
    expect(c?.highlight).toBe(true);
  });
  it('accepts custom labels', () => {
    expect(buildSlots(bar(), { [Cmd.primary]: 'SPACE' })[0]?.label).toBe('SPACE');
  });
});

describe('labelsFromBindings', () => {
  it('follows the default bindings: capture is C, swaps are 3 to 5', () => {
    const l = labelsFromBindings(DEFAULT_BINDINGS);
    expect([l[Cmd.primary], l[Cmd.secondary], l[Cmd.capture], l[Cmd.swap1], l[Cmd.swap2], l[Cmd.swap3]]).toEqual([
      '1', '2', 'C', '3', '4', '5',
    ]);
  });
  it('follows a rebinding', () => {
    const b = bindSteal(DEFAULT_BINDINGS, 'capture', 0, 'KeyV');
    expect(labelsFromBindings(b)[Cmd.capture]).toBe('V');
    expect(buildSlots(bar({ capture: { sprite: 'c', readyTick: 0, cooldownTicks: 10, capturable: true } }), labelsFromBindings(b))[2]?.label).toBe('V');
  });
});

describe('commandAt', () => {
  it('maps a click to the same Command bit as the key, and ignores disabled slots', () => {
    const slots = buildSlots(bar());
    const y = BAR_Y + 10;
    expect(commandAt(slots, 10, y)).toBe(Cmd.primary);
    expect(commandAt(slots, SLOT_SIDE + 10, y)).toBe(Cmd.secondary);
    expect(commandAt(slots, 2 * SLOT_SIDE + 10, y)).toBe(0);
    expect(commandAt(slots, 3 * SLOT_SIDE + 10, y)).toBe(Cmd.swap1);
    expect(commandAt(slots, 10, 10)).toBe(0);
  });
});

describe('captureHint', () => {
  it('announces the Capture slot with its live key during the first seconds only', () => {
    const slots = buildSlots(bar(), { [Cmd.capture]: 'V' });
    const h = captureHint(slots, 0);
    expect(h?.text).toContain('Snag unlocked!');
    expect(h?.text).toContain('Press V');
    expect(h?.x).toBe(slots[2]?.x);
    expect(captureHint(slots, CAPTURE_NOTICE_TICKS)).toBeNull();
  });
  it('is absent without a Capture slot', () => {
    expect(captureHint(buildSlots(bar({ capture: undefined })), 0)).toBeNull();
  });
});

describe('Trap glyph and slot text fit', () => {
  it('draws a ring with four spikes, not a three-point triangle like the fire symbol', () => {
    const g = trapGlyph(40, 50, 13);
    expect(g.spikes).toHaveLength(4);
    expect(g.ring.r).toBeGreaterThan(0);
    for (const [x1, y1, x2, y2] of g.spikes) expect(Math.hypot(x2 - x1, y2 - y1)).toBeGreaterThan(g.ring.r);
  });
  it('squeezes a note wider than its slot and leaves a short one alone', () => {
    expect(fitTextScale(40, SLOT_SIDE)).toBe(1);
    const k = fitTextScale(120, SLOT_SIDE);
    expect(k).toBeLessThan(1);
    expect(120 * k).toBeLessThanOrEqual(SLOT_SIDE - 8 + 1e-9);
  });
  it('puts the Trap and Element notes in separate slots', () => {
    const slots = buildSlots(bar({ trap: { readyTick: 0, cooldownTicks: 100, count: 0, max: 2 }, elemental: { name: 'Ember', kind: 1, readyTick: 0, cooldownTicks: 100, activeUntil: 0 } }));
    const trap = slots.find((s) => s.kind === 'trap');
    const el = slots.find((s) => s.kind === 'elemental');
    expect(trap?.note).toBe('Trap 0/2');
    expect(el?.note).toBe('Ember');
    expect(el?.x).not.toBe(trap?.x);
  });
});
