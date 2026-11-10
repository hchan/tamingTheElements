import type { RenderView } from '@core/index';
import { StatusId } from '@core/index';
import { HUD_HEIGHT, mainBar } from './bars';

export const BUFF_SLOT = 20;
export const BUFF_PADDING = 5;
export const FRIENDLY_COLOR = 0x11ff11;
export const HOSTILE_COLOR = 0xff1111;

export interface BuffSlot {
  readonly statusId: number;
  /** 0..1 of the status duration already elapsed (legacy `percentFinishedCD`). */
  readonly elapsed: number;
  readonly hostile: boolean;
  readonly x: number;
  readonly y: number;
  readonly color: number;
}

/** Tornado and Ice Blast debuffs are hostile (red), the self buffs friendly (green). */
export function isHostile(statusId: number): boolean {
  return statusId === StatusId.tornado || statusId === StatusId.iceBlast;
}

/** Remaining-time fraction state for one status; tick-based so pause freezes it. */
export function elapsedFraction(tick: number, startTick: number, expireTick: number): number {
  const duration = expireTick - startTick;
  if (duration <= 0) return 1;
  return Math.min(1, Math.max(0, (tick - startTick) / duration));
}

/** Buff slots left to right below the health bar, one per active status. */
export function collectBuffs(view: RenderView, id: number, xOffset: number): BuffSlot[] {
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
      color: hostile ? HOSTILE_COLOR : FRIENDLY_COLOR,
    });
  });
  return out;
}
