import { describe, expect, it } from 'vitest';
import { Cmd, type RenderActionBar } from '@core/index';
import { centreRows, BAR_Y, DEFAULT_KEY_LABELS, MIRROR_SIDE, mirrorSlots, shortLabels, ELEMENTAL_LABEL, TRAP_LABEL, elementIcon, ACTION_ICON, arcadeBarOf, slotLayout, barTop, slotSide, MAX_SLOTS, MIN_TOUCH_PX, cooldownLook, READY_FLASH_MS, MIRROR_Y, fitTextScale, elementalNote, trapNote, CAPTURE_NOTICE_TICKS, SLOT_SIDE, buildSlots, captureHint, commandAt, cooldownProgress, cooldownSweep, labelsFromBindings } from './action-bar';
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
    expect([last?.kind, last?.cmd, last?.label, last?.note]).toEqual(['trap', Cmd.trap, '0', 'Trap 1/2']);
    expect(slots[2]?.label).toBe('C');
    expect(labelsFromBindings(DEFAULT_BINDINGS)[TRAP_LABEL]).toBe('0');
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
    expect([last?.kind, last?.cmd, last?.label, last?.note, last?.element]).toEqual(['elemental', Cmd.elemental, '-', 'Ember', 1]);
    expect(labelsFromBindings(DEFAULT_BINDINGS)[ELEMENTAL_LABEL]).toBe('-');
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
  it('wears its element mark from the icon sheet, the generic one for none', () => {
    expect([1, 2, 3, 4].map(elementIcon)).toEqual([ACTION_ICON.fire, ACTION_ICON.water, ACTION_ICON.earth, ACTION_ICON.air]);
    expect(elementIcon(0)).toBe(ACTION_ICON.element);
    expect(buildSlots(bar({ elemental: { name: 'Ember', kind: 1, readyTick: 0, cooldownTicks: 100, activeUntil: 0 } })).at(-1)?.icon).toBe(ACTION_ICON.fire);
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
  it('re-lays the slots small, left-aligned, clear of the main bar and inside the screen', () => {
    const slots = buildSlots(bar());
    const m = mirrorSlots(slots);
    expect(m.map((s) => s.progress)).toEqual(slots.map((s) => s.progress));
    expect(m.map((s) => s.label)).toEqual(slots.map((s) => s.label));
    expect(m[0]?.x).toBeLessThan(10);
    for (const s of m) {
      expect(s.size).toBe(MIRROR_SIDE);
      expect(s.y).toBe(MIRROR_Y);
      expect(s.y + s.size).toBeLessThanOrEqual(BAR_Y);
      expect(s.cmd).toBe(0);
      expect(s.touch).toBe('');
    }
    const last = m[m.length - 1];
    expect(last && last.x + last.size).toBeLessThanOrEqual(1280);
    for (let i = 1; i < m.length; i++) expect((m[i]?.x ?? 0) - ((m[i - 1]?.x ?? 0) + MIRROR_SIDE)).toBeGreaterThan(0);
    expect(mirrorSlots([])).toEqual([]);
    expect(mirrorSlots(slots, 100).every((s) => s.y === 100)).toBe(true);
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

describe('Slot text fit', () => {
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

const arc = (over: Partial<Parameters<typeof buildSlots>[2] & object> = {}): NonNullable<Parameters<typeof buildSlots>[2]> => ({
  meter: 1500, weatherCharge: 0, guard: 0, guarding: false, dashIn: 0, chargeIn: 0, cleanseIn: 0, keepCharge: false, ...over,
});

describe('Arcade boxes (one consistent bar)', () => {
  const full = buildSlots(bar({ trap: { readyTick: 0, cooldownTicks: 100, count: 0, max: 2 }, elemental: { name: 'Ember', kind: 1, readyTick: 0, cooldownTicks: 100, activeUntil: 0 } }), DEFAULT_KEY_LABELS, arc());

  it('gives every box an icon (a sprite or a sheet cell), a key and a touch overlay in Arcade, all in one left-aligned run', () => {
    expect(full.length).toBeLessThanOrEqual(MAX_SLOTS);
    for (const s of full) {
      expect(s.sprite !== '' || s.icon >= 0 || s.kind === 'cleanse').toBe(true); // Cleanse draws its own glyph
      expect(s.size).toBe(SLOT_SIDE);
    }
    const kinds = full.map((s) => s.kind);
    expect(kinds).toEqual(expect.arrayContaining(['charge', 'weather', 'dash', 'guard', 'super', 'trap', 'elemental', 'cleanse']));
    expect(full.filter((s) => s.kind !== 'ability' && s.kind !== 'capture').every((s) => s.touch !== '' || s.kind === 'swap')).toBe(true);
    const xs = full.map((s) => s.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(Math.max(...full.map((s) => s.x + s.size))).toBeLessThanOrEqual(1280);
  });
  it('shows no Arcade-only boxes without Arcade read-outs', () => {
    expect(buildSlots(bar()).map((s) => s.kind)).not.toEqual(expect.arrayContaining(['dash']));
    expect(buildSlots(bar()).every((s) => s.touch === '')).toBe(true);
  });
  it('always keeps a dimmed disabled Charge box for a ranged hero, so slots never shift', () => {
    const kept = buildSlots(bar(), DEFAULT_KEY_LABELS, arc({ chargeIn: -1 })).find((s) => s.kind === 'charge');
    expect(kept?.disabled).toBe(true);
  });
  it('has a Cleanse box on the = key that fills over its 10 s cooldown', () => {
    const ready = buildSlots(bar(), DEFAULT_KEY_LABELS, arc()).find((s) => s.kind === 'cleanse');
    expect(ready?.progress).toBe(1);
    expect(ready?.touch).toBe('Cleanse');
    const half = buildSlots(bar(), DEFAULT_KEY_LABELS, arc({ cleanseIn: 250 })).find((s) => s.kind === 'cleanse');
    expect(half?.progress).toBeCloseTo(0.5);
    expect(half?.note).toBe('Cleanse 5s');
  });
  it('reads cooldowns and meters as progress 0..1 with words', () => {
    const d = buildSlots(bar(), DEFAULT_KEY_LABELS, arc({ dashIn: 15, chargeIn: 150, weatherCharge: 0, guard: 0 }));
    expect(d.find((s) => s.kind === 'dash')?.progress).toBeCloseTo(0.5);
    expect(d.find((s) => s.kind === 'charge')?.progress).toBeCloseTo(0.5);
    expect(d.find((s) => s.kind === 'dash')?.note).toBe('Dash 1s');
    expect(d.find((s) => s.kind === 'super')?.note).toMatch(/^Super/);
    expect(d.every((s) => s.progress >= 0 && s.progress <= 1)).toBe(true);
  });
  it('reads a team off the render view read-outs, idle for no active hero', () => {
    const ar = { meter: [10, 20], weatherCharge: [1, 2], active: (t: number) => (t === 0 ? 3 : -1), guard: () => 7, guarding: () => true, dashIn: () => 4, chargeIn: () => 5 };
    expect(arcadeBarOf(ar as never, 0, false)).toMatchObject({ meter: 10, weatherCharge: 1, guard: 7, guarding: true, dashIn: 4, chargeIn: 5 });
    expect(arcadeBarOf(ar as never, 1, true)).toMatchObject({ meter: 20, guarding: false, dashIn: 0, chargeIn: -1, keepCharge: true });
  });
});

describe('layout never goes right and keeps a finger-sized box', () => {
  it('wraps to further rows above the first, left-aligned', () => {
    const k = 0.4;
    const side = slotSide(k);
    expect(side * k).toBeGreaterThanOrEqual(MIN_TOUCH_PX - 1e-9);
    const a = slotLayout(0, k);
    const last = slotLayout(MAX_SLOTS - 1, k);
    expect(a.x).toBeLessThan(10);
    expect(last.x + last.size).toBeLessThanOrEqual(1280);
    expect(last.row).toBeGreaterThan(0);
    expect(last.y).toBeLessThan(a.y);
    expect(barTop(MAX_SLOTS, k)).toBeLessThanOrEqual(last.y);
  });
  it('keeps the legacy size at full size', () => {
    expect(slotSide(1)).toBe(SLOT_SIDE);
    expect(slotSide()).toBe(SLOT_SIDE);
    expect(slotLayout(0).row).toBe(0);
  });
});

describe('cooldownLook (the one cooldown look)', () => {
  const look = (p: number, dis = false, age = -1, reduced = false) => cooldownLook(p, dis, 10, 20, 77, age, reduced);
  it('shades the not-ready part with one fixed alpha, nothing when ready', () => {
    expect(look(1).fill).toBeUndefined();
    expect(look(0.4).fill).toBeDefined();
    expect(look(0.4).fillAlpha).toBe(look(0.8).fillAlpha);
  });
  it('flashes eased out over READY_FLASH_MS then stops', () => {
    const a = look(1, false, 0).flashAlpha;
    const b = look(1, false, READY_FLASH_MS / 2).flashAlpha;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(0);
    expect(look(1, false, READY_FLASH_MS).flashAlpha).toBe(0);
    expect(look(1, false, -1).pulse).toBe(0);
  });
  it('reduced motion: a static whole-box shade and no flash or pulse', () => {
    const r = look(0.4, false, 0, true);
    expect(r.fill).toEqual([10, 20, 87, 20, 87, 97, 10, 97]);
    expect(r.flashAlpha).toBe(0);
    expect(r.pulse).toBe(0);
  });
  it('shades a disabled box whole without a flash', () => {
    const d = look(1, true, 0);
    expect(d.fill).toHaveLength(8);
    expect(d.flashAlpha).toBe(0);
  });
});

describe('centreRows and the cleanse icon', () => {
  it('centres each row on the 1280 frame without changing its spacing', () => {
    const mk = (x: number, y: number) => ({ x, y, size: 77 }) as never;
    const out = centreRows([mk(1, 640), mk(78, 640), mk(155, 640), mk(1, 560)]) as { x: number; y: number; size: number }[];
    const row = out.filter((s) => s.y === 640);
    const left = Math.min(...row.map((s) => s.x));
    const right = Math.max(...row.map((s) => s.x + s.size));
    expect(Math.abs(left - (1280 - right))).toBeLessThanOrEqual(1);
    expect((row[1]?.x ?? 0) - (row[0]?.x ?? 0)).toBe(77);
    expect(out[3]?.x).toBe(Math.floor((1280 - 77) / 2));
  });
  it('gives cleanse its own tile on the sheet', () => {
    expect(ACTION_ICON['cleanse']).toBe(12);
  });
});
