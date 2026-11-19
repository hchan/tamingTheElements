import type { TourKeyChip } from '@ui/screens/tour';
import { ARCADE_SNAG_SLOT } from '@core/index';
import { leadAbilityNames } from './lead-names';
import { actionKeyLabel, codeLabel, type Bindings, type GameAction } from '../platform/input/bindings';

/** The Tour stage card's first-run Controls row (QA r66); the in-fight card keeps first-run-hint's lines. */

const key = (b: Bindings, a: GameAction): string => actionKeyLabel(b, a) ?? 'unbound';

const DIRS = ['up', 'left', 'down', 'right'] as const;
const ARROW_CODE = { up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight' } as const;
const ARROW_GLYPH = { up: '↑', left: '←', down: '↓', right: '→' } as const;

/** One cap per direction (up, left, down, right): the first bound non-arrow key, else the arrow glyph, else "unbound". */
function moveCaps(b: Bindings): string[] {
  return DIRS.map((d) => {
    const codes = b[d];
    const plain = codes.find((c) => !c.startsWith('Arrow'));
    if (plain !== undefined) return codeLabel(plain);
    return codes.length === 0 ? 'unbound' : ARROW_GLYPH[d];
  });
}

/** Two rows of key chips for a keyboard player. Snag only when the team can throw it; Tag is slots 3 and 4 (the Tour fields three heroes). */
export function tourKeysDesktop(b: Bindings, lead: string | undefined, snag: boolean): readonly (readonly TourKeyChip[])[] {
  const names = (lead === undefined ? undefined : leadAbilityNames(lead)) ?? ['Attack', 'Second attack'];
  const leadSnagSlot = lead === undefined ? undefined : ARCADE_SNAG_SLOT[lead];
  // The lead's own Snag box shows both keys (its slot key and C); a teammate's Snag is a bare C, flagged as hero-dependent.
  const slotChip = (slot: 0 | 1): TourKeyChip => {
    const k = key(b, slot === 0 ? 'slot1' : 'slot2');
    return leadSnagSlot === slot ? { keys: [k, key(b, 'capture')], action: 'Snag' } : { keys: [k], action: names[slot] };
  };
  const teammateSnag = snag && leadSnagSlot === undefined;
  const arrowsToo = DIRS.every((d) => b[d].includes(ARROW_CODE[d]));
  return [
    [
      { keys: moveCaps(b), action: 'Move', ...(arrowsToo ? { note: '(or arrows)' } : {}) },
      slotChip(0),
      slotChip(1),
      ...(teammateSnag ? [{ keys: [key(b, 'capture')], action: 'Snag' }] : []),
    ],
    [
      { keys: [key(b, 'dash')], action: 'Dash' },
      { keys: [key(b, 'guard')], action: 'Guard (hold)' },
      { keys: [key(b, 'super')], action: 'Super' },
      { keys: [key(b, 'run'), 'Tab'], action: 'Run' },
      { keys: [key(b, 'slot3'), key(b, 'slot4')], action: 'Tag' },
    ],
  ];
}

/** Two rows for a touch-first device: the stick and the bar buttons. */
export function tourKeysTouch(snag: boolean): readonly (readonly TourKeyChip[])[] {
  return [
    [
      { keys: ['Stick'], action: 'Move' },
      { keys: ['1', '2'], action: 'Strike' },
    ],
    [
      { keys: [], action: 'Bar:' },
      { keys: ['Dash'], action: '' },
      { keys: ['Guard'], action: '' },
      { keys: ['Super'], action: '' },
      { keys: ['Run'], action: '' },
      { keys: ['Tag'], action: '' },
      ...(snag ? [{ keys: ['Snag'], action: '' }] : []),
    ],
  ];
}
