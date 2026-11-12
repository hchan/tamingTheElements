import { Cmd } from '@core/index';
import { describe, expect, it } from 'vitest';
import { arcadeAvatar, AVATAR_SIZE, mainBar, sideOffset } from './bars';
import { NOTICE_MS, chargeNotice, elementalNotice, noticeAlpha, swapNotice, swapSeconds, swapSlotOf, type SwapState } from './swap-notice';

const ok: SwapState = { fighting: true, frozen: false, stunned: false, noPartner: false, cooldownTicks: 0 };

describe('swapNotice', () => {
  it('says nothing when the swap would go through', () => {
    expect(swapNotice(ok)).toBeUndefined();
  });

  it('names the cooldown left, rounded up to a tenth', () => {
    expect(swapNotice({ ...ok, cooldownTicks: 150 })).toBe('Swap ready in 3.0s');
    expect(swapNotice({ ...ok, cooldownTicks: 1 })).toBe('Swap ready in 0.1s');
    expect(swapSeconds(48)).toBe('1.0s');
  });

  it('prefers the harder refusals over the cooldown', () => {
    expect(swapNotice({ ...ok, frozen: true, cooldownTicks: 90 })).toBe("Can't swap: frozen");
    expect(swapNotice({ ...ok, stunned: true, cooldownTicks: 90 })).toBe("Can't swap: stunned");
    expect(swapNotice({ ...ok, fighting: false, frozen: true })).toBe("Can't swap: round not started");
    expect(swapNotice({ ...ok, noPartner: true, fighting: false })).toBe("Can't swap: no partner to tag in");
  });

  it('finds the pressed slot', () => {
    expect(swapSlotOf(Cmd.swap3 | Cmd.up)).toBe(2);
    expect(swapSlotOf(Cmd.up)).toBe(-1);
  });
});

describe('noticeAlpha', () => {
  it('holds steady, then fades, then ends', () => {
    expect(noticeAlpha(0, false)).toBe(1);
    const mid = noticeAlpha(NOTICE_MS - 150, false);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(noticeAlpha(NOTICE_MS, false)).toBe(0);
  });

  it('does not fade with reduced motion', () => {
    expect(noticeAlpha(NOTICE_MS - 50, true)).toBe(1);
    expect(noticeAlpha(NOTICE_MS, true)).toBe(0);
  });
});

describe('arcadeAvatar', () => {
  it('sits at the outer end of each main bar with the same gap, level with its top edge', () => {
    const a0 = arcadeAvatar(0);
    const a1 = arcadeAvatar(1);
    const b0 = mainBar(sideOffset(0));
    const b1 = mainBar(sideOffset(1));
    expect(b0.minX - (a0.x + AVATAR_SIZE)).toBe(a1.x - b1.maxX);
    expect(a0.y).toBe(a1.y);
    expect(a0.y).toBe(b0.y - b0.line / 2);
    expect(a0.size).toBe(AVATAR_SIZE);
  });
});

describe('chargeNotice', () => {
  const go = { fighting: true, chargeIn: 0, blocked: undefined };

  it('says nothing when the charge would start', () => {
    expect(chargeNotice(go)).toBeUndefined();
  });

  it('names why a charge does nothing, hardest reason first', () => {
    expect(chargeNotice({ ...go, fighting: false, chargeIn: -1 })).toBe("Can't charge: round not started");
    expect(chargeNotice({ ...go, chargeIn: -1 })).toBe("Can't charge: ranged hero");
    expect(chargeNotice({ ...go, chargeIn: 120, blocked: 'stunned' })).toBe("Can't charge: stunned");
    expect(chargeNotice({ ...go, chargeIn: 120 })).toBe('Charge ready in 2.4s');
  });
});

describe('elementalNotice', () => {
  it('names the ability and the seconds left while it cools, and says nothing when it would cast', () => {
    expect(elementalNotice(true, 100, { name: 'Gale', readyTick: 220 })).toBe('Gale ready in 2.4s');
    expect(elementalNotice(true, 220, { name: 'Gale', readyTick: 220 })).toBeUndefined();
    expect(elementalNotice(false, 100, { name: 'Gale', readyTick: 220 })).toBeUndefined();
    expect(elementalNotice(true, 100, undefined)).toBe('No element ability for this hero');
  });
});
