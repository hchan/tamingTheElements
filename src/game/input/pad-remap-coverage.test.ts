import { afterEach, describe, expect, it } from 'vitest';
import { ARCADE_PAD, DEFAULT_PAD, commandFromPad, padConfigFor, pauseEdge, type PadSnapshot } from './gamepad';
import { PAD_ROWS, padBind, setPadOverrides } from '../platform/input/pad-bindings';

/** Remap-coverage audit, pad side (the Key Bindings screen half is src/ui/screens/remap-coverage.dom.test.ts). */
afterEach(() => {
  setPadOverrides({});
});

const padWith = (down: number): PadSnapshot => ({ axes: [0, 0], buttons: Array.from({ length: 32 }, (_, i) => ({ pressed: i === down })) });

describe('pad remap coverage', () => {
  it('every button in either pad table belongs to a row, and moving the row moves the command', () => {
    for (const [arcade, base] of [
      [false, DEFAULT_PAD],
      [true, ARCADE_PAD],
    ] as const) {
      for (const [btn, bit] of Object.entries(base.buttons)) {
        const row = PAD_ROWS.find((r) => r.def === Number(btn));
        expect(row, `no row for default button ${btn}`).toBeDefined();
        setPadOverrides(padBind({}, row?.id ?? '', 20).overrides);
        const cfg = padConfigFor(arcade);
        expect(commandFromPad(padWith(20), true, cfg) & bit, `${row?.id ?? ''} (arcade ${String(arcade)})`).toBe(bit);
        expect(commandFromPad(padWith(Number(btn)), true, cfg) & bit, `${row?.id ?? ''} old button`).toBe(0);
        setPadOverrides({});
      }
    }
  });

  it('the pause button is a row and rebinding it moves the pause edge', () => {
    expect(PAD_ROWS.some((r) => r.id === 'pause' && r.def === DEFAULT_PAD.pauseButton)).toBe(true);
    setPadOverrides(padBind({}, 'pause', 21).overrides);
    expect(pauseEdge(false, padWith(21), padConfigFor(false)).pressed).toBe(true);
  });
});
