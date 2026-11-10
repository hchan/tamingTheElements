import { describe, expect, it } from 'vitest';
import { FixedStepDriver, pauseOnHidden, type PauseReason } from './fixed-step-driver';

function make() {
  let t = 0;
  let ticks = 0;
  const d = new FixedStepDriver({ tick: () => ticks++, now: () => t });
  return { d, ticks: () => ticks, set: (v: number) => (t = v) };
}

const REASONS: readonly PauseReason[] = ['user', 'hidden', 'overlay', 'replay', 'ended'];
const PAIRS = REASONS.flatMap((a) => REASONS.filter((b) => b !== a).map((b) => [a, b] as const));

describe('FixedStepDriver pause reasons', () => {
  it.each(PAIRS)('lifting %s keeps the sim held by %s, and lifting both runs it again', (a, b) => {
    const { d, ticks, set } = make();
    d.pause(a);
    d.pause(b);
    d.resume(a);
    expect(d.isPaused).toBe(true);
    expect(d.isPausedFor(b)).toBe(true);
    d.frame(1000);
    expect(ticks()).toBe(0);
    set(1000);
    d.resume(b);
    expect(d.isPaused).toBe(false);
    d.frame(1040);
    expect(ticks()).toBe(2);
  });

  it('lifting a reason that was never set does nothing', () => {
    const { d } = make();
    d.pause('user');
    d.resume('hidden');
    expect(d.isPaused).toBe(true);
  });

  it('a hidden tab becoming visible does not clear the user pause', () => {
    const { d } = make();
    const listeners: (() => void)[] = [];
    const doc = {
      hidden: false,
      addEventListener: (_: string, l: () => void) => void listeners.push(l),
      removeEventListener: () => undefined,
    };
    pauseOnHidden(doc as never, d);
    d.pause('user');
    doc.hidden = true;
    for (const l of listeners) l();
    doc.hidden = false;
    for (const l of listeners) l();
    expect(d.isPaused).toBe(true);
    d.resume('user');
    expect(d.isPaused).toBe(false);
  });

  it('three reasons need all three lifted', () => {
    const { d } = make();
    d.pause('user');
    d.pause('hidden');
    d.pause('overlay');
    d.resume('hidden');
    d.resume('overlay');
    expect(d.isPaused).toBe(true);
    d.resume('user');
    expect(d.isPaused).toBe(false);
  });
});
