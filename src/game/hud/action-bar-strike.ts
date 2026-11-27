import { abilityNameOfSprite, abilityShortOfSprite } from './kit-names';
import { SNAG_SPRITE, type ActionSlot } from './action-bar-types';

/**
 * Portrait phones draw Strike 1 and Strike 2 as circles on the deck, so the bar's Blast and Flame tiles (the same two commands) are dropped:
 * one way to fire each, and the remaining eight tiles fit one row. A Snag rope slot stays (a tile with that note is not a plain strike). Pure, for tests.
 */
export function withoutStrikeTiles<T extends Pick<ActionSlot, 'kind' | 'sprite'>>(slots: readonly T[]): T[] {
  return slots.filter((s) => !(s.kind === 'ability' && s.sprite !== SNAG_SPRITE));
}

/** The two Strike circles' own ability names for a bar's abilities (index 0 = Strike 1): [short word on the circle, full name for screen readers]. Pure, for tests. */
export function strikeCues(abilities: readonly { sprite: string }[]): [string, string][] {
  return [0, 1].map((i): [string, string] => {
    const sprite = abilities[i]?.sprite ?? '';
    // The rope-throw ability is "Snag" on the bar box (buildSlots, slotTip), so the circle says the same (QA r107 P2).
    if (sprite === SNAG_SPRITE) return ['Snag', 'Snag'];
    const short = abilityShortOfSprite(sprite) ?? '';
    return [short, abilityNameOfSprite(sprite) ?? short];
  });
}

/** Portrait phones: name what each Strike circle fires (the bar's Blast / Flame / Ice Shock tiles are dropped), as a small third line on the circle. Idempotent. */
export function showStrikeCues(cues: readonly (readonly [string, string])[]): void {
  if (typeof document === 'undefined') return;
  ['touchStrike1', 'touchStrike2'].forEach((id, i) => {
    const b = document.getElementById(id);
    const cue = cues[i];
    if (!b || !cue) return;
    let n = b.querySelector<HTMLElement>('.touchStrikeAbility');
    if (!n) {
      n = document.createElement('span');
      n.className = 'touchStrikeAbility';
      b.append(n);
    }
    if (n.textContent !== cue[0]) n.textContent = cue[0];
    // Long names (Adrenaline, Rock Armr) get a smaller face so the whole word fits the circle (QA r101 P2).
    const len = cue[0].length >= 10 ? 'xl' : cue[0].length >= 8 ? 'long' : '';
    if ((n.dataset['len'] ?? '') !== len) {
      if (len) n.dataset['len'] = len;
      else delete n.dataset['len'];
    }
    const key = b.querySelector('.touchStrikeKey')?.textContent ?? String(i + 1);
    const label = cue[1] === '' ? `${key} Strike` : `${key} Strike: ${cue[1]}`;
    if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
  });
}
