import { Cmd, RUN_AWAY_DESCRIPTION, RUN_AWAY_NAME, RUN_TOWARDS_DESCRIPTION, RUN_TOWARDS_NAME } from '@core/index';
import { LOGICAL_WIDTH as LOGICAL_W } from '../boot/viewport';
import { COMMON_EFFECT, HERO_EFFECT, elementalEffect, elementalTitle } from '../platform/ability-text';
import { abilityNameOfSprite, trapNameOfElement, trapTextOfElement } from './kit-names';
import { SNAG_SPRITE, type ActionSlot } from './action-bar-types';

const ELEMENT_BY_KIND = ['void', 'fire', 'water', 'earth', 'air'] as const;

/** The Trap slot's words (never colour alone): whole seconds left while cooling, else the live count, or "full" at the cap. */
export function trapNote(tick: number, t: { readyTick: number; count: number; max: number }, name = 'Trap'): string {
  if (tick < t.readyTick) return `${name} ${String(Math.ceil((t.readyTick - tick) / 50))}s`;
  return t.count >= t.max ? `${name} full` : `${name} ${String(t.count)}/${String(t.max)}`;
}

/** The elemental slot's words (never colour alone): "<Name> on" while its buff runs, whole seconds left while cooling, else the name. */
export function elementalNote(tick: number, e: { name: string; readyTick: number; activeUntil: number }): string {
  if (tick < e.activeUntil) return `${e.name} on`;
  if (tick < e.readyTick) return `${e.name} ${String(Math.ceil((e.readyTick - tick) / 50))}s`;
  return e.name;
}

/** The tooltip for a box: its plain name and a one-line effect (the Guide's own text, so the two never disagree). */
export function slotTip(s: Pick<ActionSlot, 'kind' | 'cmd' | 'element'> & { sprite?: string; runAway?: boolean }): { title: string; text: string } {
  switch (s.kind) {
    case 'ability':
      if (s.sprite === SNAG_SPRITE) return { title: 'Snag', text: COMMON_EFFECT.snag };
      {
        const own = abilityNameOfSprite(s.sprite ?? '');
        if (own !== undefined) return { title: own, text: s.cmd === Cmd.primary ? HERO_EFFECT.primary : HERO_EFFECT.secondary };
      }
      return s.cmd === Cmd.primary ? { title: 'Attack', text: HERO_EFFECT.primary } : { title: 'Special', text: HERO_EFFECT.secondary };
    case 'capture': return { title: 'Snag', text: COMMON_EFFECT.snag };
    case 'swap': return { title: 'Tag', text: COMMON_EFFECT.tag };
    case 'trap': return { title: trapNameOfElement(s.element), text: trapTextOfElement(s.element) ?? COMMON_EFFECT.trap };
    case 'elemental': return { title: elementalTitle(s.element ?? 0), text: elementalEffect(ELEMENT_BY_KIND[s.element ?? 0] ?? 'void') };
    case 'super': return { title: 'Super', text: COMMON_EFFECT.super };
    case 'guard': return { title: 'Guard', text: COMMON_EFFECT.guard };
    case 'dash': return { title: 'Dash', text: COMMON_EFFECT.dash };
    case 'weather': return { title: 'Weather', text: COMMON_EFFECT.weather };
    case 'charge': return { title: 'Charge', text: COMMON_EFFECT.charge };
    case 'cleanse': return { title: 'Cleanse', text: COMMON_EFFECT.cleanse };
    case 'run': return s.runAway === false ? { title: RUN_TOWARDS_NAME, text: RUN_TOWARDS_DESCRIPTION } : { title: RUN_AWAY_NAME, text: RUN_AWAY_DESCRIPTION };
  }
}

/** A tip sits this far above the box's top, clearing the TAG caption that floats over the swap slot (tag-view CAPTION_LIFT 26 + its height). */
const TIP_LIFT = 44;
/** Where a tooltip `w` x `h` goes for a box: centred above it (clear of the TAG caption), kept inside the 1280-wide screen, below the top edge. Pure, for tests. */
export function tipPlacement(s: Pick<ActionSlot, 'x' | 'y' | 'size'>, w: number, h: number): { x: number; y: number } {
  const x = Math.min(LOGICAL_W - w - 4, Math.max(4, s.x + s.size / 2 - w / 2));
  return { x, y: Math.max(4, s.y - h - TIP_LIFT) };
}

/** How long a held finger waits before a touch tip shows, and how long tips stay hidden after a super starts (its banner owns the screen). */
export const TIP_LONG_PRESS_MS = 450;
export const TIP_SUPER_QUIET_MS = 2800;
/** A tip never stays pinned: it hides this long after it first showed for the current target (a resting mouse or focus is not a request to read it all fight). */
export const TIP_MAX_MS = 3500;

/** Pure: has a tip that began at `since` (ms) run out at `now`? */
export function tipExpired(since: number, now: number): boolean {
  return now - since >= TIP_MAX_MS;
}

/** A plain-word name for a box that has no state words of its own, so every box of the dressed bar carries a readable label. */
export function slotWord(s: Pick<ActionSlot, 'kind' | 'cmd' | 'note'>): string {
  if (s.note !== '') return s.note;
  switch (s.kind) {
    case 'ability': return s.cmd === Cmd.primary ? 'Attack' : 'Special';
    case 'capture': return 'Snag';
    case 'swap': return 'Tag';
    case 'trap': return 'Trap';
    case 'elemental': return 'Element';
    case 'super': return 'Super';
    case 'guard': return 'Guard';
    case 'dash': return 'Dash';
    case 'weather': return 'Weather';
    case 'charge': return 'Charge';
    case 'cleanse': return 'Cleanse';
    case 'run': return 'Run';
  }
}
