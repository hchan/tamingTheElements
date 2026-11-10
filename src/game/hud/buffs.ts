import type { RenderView } from '@core/index';
import { StatusId } from '@core/index';
import { HUD_HEIGHT, mainBar } from './bars';

export const BUFF_SLOT = 20;
export const BUFF_PADDING = 5;
export const FRIENDLY_COLOR = 0x11ff11;
export const HOSTILE_COLOR = 0xff1111;
/** High-contrast, colour-blind-safe pair (blue vs vermillion). */
export const HC_FRIENDLY_COLOR = 0x56b4e9;
export const HC_HOSTILE_COLOR = 0xd55e00;

/** Friendly buffs draw a plus, hostile debuffs a cross, so the two differ by shape and not only by colour. */
export type BuffGlyph = 'plus' | 'cross';

export interface BuffSlot {
  readonly statusId: number;
  /** 0..1 of the status duration already elapsed (legacy `percentFinishedCD`). */
  readonly elapsed: number;
  readonly hostile: boolean;
  readonly x: number;
  readonly y: number;
  readonly color: number;
  readonly glyph: BuffGlyph;
}

export function buffColor(hostile: boolean, highContrast: boolean): number {
  if (highContrast) return hostile ? HC_HOSTILE_COLOR : HC_FRIENDLY_COLOR;
  return hostile ? HOSTILE_COLOR : FRIENDLY_COLOR;
}

/** Tornado, Ice Blast and the tidal slow debuffs are hostile (red), the self buffs friendly (green). */
export function isHostile(statusId: number): boolean {
  return statusId === StatusId.tornado || statusId === StatusId.iceBlast || statusId === StatusId.superSlow;
}

/** Remaining-time fraction state for one status; tick-based so pause freezes it. */
export function elapsedFraction(tick: number, startTick: number, expireTick: number): number {
  const duration = expireTick - startTick;
  if (duration <= 0) return 1;
  return Math.min(1, Math.max(0, (tick - startTick) / duration));
}

/** Buff slots left to right below the health bar, one per active status. */
export function collectBuffs(view: RenderView, id: number, xOffset: number, highContrast = false): BuffSlot[] {
  const out: BuffSlot[] = [];
  const minX = mainBar(xOffset).minX;
  const y = HUD_HEIGHT - BUFF_PADDING - BUFF_SLOT;
  const tick = view.tick;
  view.forEachStatus(id, (st) => {
    const hostile = isHostile(st.id);
    out.push({
      statusId: st.id,
      elapsed: elapsedFraction(tick, st.startTick, st.expireTick),
      hostile,
      x: minX + out.length * BUFF_SLOT,
      y,
      color: buffColor(hostile, highContrast),
      glyph: hostile ? 'cross' : 'plus',
    });
  });
  return out;
}
