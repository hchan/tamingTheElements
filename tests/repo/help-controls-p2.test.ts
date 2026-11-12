import { describe, expect, it } from 'vitest';
import { P2_BINDINGS } from '../../src/game/input/local-two';
import { codeLabel } from '../../src/game/platform/input/bindings';
import { P2_KEYS } from '../../src/ui/screens/help-controls';

// src/ui may not import src/game/input, so Help repeats Player 2's fixed keys; this pins the copy.
describe('Help Player 2 keys', () => {
  it('match the fixed P2 bindings', () => {
    const punct: Readonly<Record<string, string>> = { Comma: ',', Period: '.', Semicolon: ';' };
    const k = (a: keyof typeof P2_BINDINGS): string =>
      P2_BINDINGS[a].map((c) => punct[c] ?? codeLabel(c)).join('/');
    const by = Object.fromEntries(P2_KEYS.map((r) => [r.action, r.keys]));
    expect(by['Trap']).toBe(k('trap'));
    expect(by['Element']).toBe(k('elemental'));
    expect(by['Tag']).toBe(k('slot3'));
    expect(by['Tag 2']).toBe(k('slot4'));
    expect(by['Attack']).toBe(k('slot1'));
    expect(by['Second attack']).toBe(k('slot2'));
    expect(by['Dash']).toBe(k('dash'));
    expect(by['Guard (hold)']).toBe(k('guard'));
    expect(by['Weather']).toBe(k('weather'));
    expect(by['Charge']).toBe(k('charge'));
    expect(by['Super']).toBe(k('super'));
    expect(by['Move']).toBe([k('up'), k('left'), k('down'), k('right')].join(' '));
  });
});
