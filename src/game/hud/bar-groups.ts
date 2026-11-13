import { LOGICAL_WIDTH as LOGICAL_W } from '../boot/viewport';
import { BAR_Y, LOGICAL_HEIGHT, slotSide, type ActionSlot, type BarGroup, type GroupHeader, type GroupedBar } from './action-bar';

/**
 * Grouped action bar (ideas/brainstorm/action-bar-rethink-hero-kits.md, docs/design/action-bar-kits.md). VIEW-ONLY prototype, dev and
 * test builds only (`?ff=barGroups`): the same boxes as the flat bar, in the same cooldown renderer and with the same keys and touch
 * overlays, but re-ordered into labelled groups: HERO (the two signature abilities and the Trap, which becomes hero slot 3), COMMON
 * (Guard, the element's ability, Weather: the same for every hero) and TEAM (Tag, Snag, Charge, Dash, Super). Cleanse joins COMMON when
 * the sim has it. Nothing here touches the sim.
 */
export const GROUP_ORDER: readonly BarGroup[] = ['hero', 'common', 'team'];
export const GROUP_TITLE: Readonly<Record<BarGroup, string>> = { hero: 'HERO', common: 'COMMON', team: 'TEAM' };
/** Space between groups and the height of the title strip above the boxes (logical px). */
export const GROUP_GAP = 14;
export const HEADER_H = 16;

/** `?ff=barGroups` (dev and test builds only, like every `ff` flag). */
export function wantsGroupedBar(search: string, devOrTest: boolean): boolean {
  if (!devOrTest) return false;
  return (new URLSearchParams(search).get('ff') ?? '').split(',').map((s) => s.trim()).includes('barGroups');
}

/** Which group a box belongs to. */
export function groupOf(kind: ActionSlot['kind']): BarGroup {
  switch (kind) {
    case 'ability':
    case 'trap':
      return 'hero';
    case 'guard':
    case 'elemental':
    case 'cleanse':
    case 'weather':
      return 'common';
    default:
      return 'team';
  }
}

/**
 * Re-lay `slots` into groups: group order, a GROUP_GAP between groups, a title strip above every run of boxes, wrapping to a row above
 * when a row is full (as the flat bar does). The sim-facing fields of every slot (cmd, touch, progress, note) are untouched, so the one
 * cooldown renderer, the click commands and the touch overlays work as before. Pure.
 */
export function groupSlots(slots: readonly ActionSlot[], k?: number): GroupedBar {
  const size = slotSide(k);
  const rowH = size + HEADER_H;
  const y0 = Math.min(BAR_Y + 1, LOGICAL_HEIGHT - size - 1);
  const out: ActionSlot[] = [];
  const headers: GroupHeader[] = [];
  let row = 0;
  let x = 1;
  for (const g of GROUP_ORDER) {
    const members = slots.filter((s) => groupOf(s.kind) === g);
    if (members.length === 0) continue;
    if (x > 1) x += GROUP_GAP;
    let start = x;
    let count = 0;
    const close = (): void => {
      if (count > 0) headers.push({ group: g, text: GROUP_TITLE[g], x: start, y: y0 - row * rowH - HEADER_H, w: count * size });
    };
    for (const s of members) {
      if (x + size > LOGICAL_W) {
        close();
        row++;
        x = 1;
        start = 1;
        count = 0;
      }
      out.push({ ...s, x, y: y0 - row * rowH, size });
      x += size;
      count++;
    }
    close();
  }
  const top = Math.min(BAR_Y, ...headers.map((h) => h.y)) - 2;
  return { slots: out, headers, top };
}
