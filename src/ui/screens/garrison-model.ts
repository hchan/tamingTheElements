import {
  CHARACTERS,
  levelFromXp,
  pickOpponents,
  portalOpponent,
  practiceOpponent,
  sortGarrison,
} from '@core/menu-index';
import type { GarrisonEntry, GarrisonMemberV1, Opponent, SaveV1, Sfc32 } from '@core/menu-index';

export type MatchMode = 'battle' | 'practice' | 'portal';

/** Intent handed to the battleground: ordered heroes plus their opponents. */
export interface MatchSetup {
  readonly mode: MatchMode;
  readonly heroes: readonly GarrisonMemberV1[];
  readonly opponents: readonly Opponent[];
}

export interface ButtonState {
  readonly enabled: boolean;
  /** Legacy alert text shown when the button is clicked while not ready. */
  readonly message: string | null;
}

export interface ButtonStates {
  readonly battle: ButtonState;
  readonly practice: ButtonState;
  readonly portal: ButtonState;
  readonly portalVisible: boolean;
}

export interface Selection {
  /** Selected garrison ids; index + 1 is the battle order number. */
  readonly order: readonly string[];
}

export const EMPTY_SELECTION: Selection = { order: [] };

/**
 * Legacy row click. Chapters 1-2: single select (click again clears). Later: toggle; a fourth pick
 * evicts the hero holding slot 3.
 */
export function toggleSelection(sel: Selection, id: string, chapter: number, testerTeam = false): Selection {
  const has = sel.order.includes(id);
  // Tester mode (docs/TESTER-MODE.md): the later-chapter picker (up to 3) in any chapter.
  if (chapter <= 2 && !testerTeam) return { order: has ? [] : [id] };
  if (has) return { order: sel.order.filter((x) => x !== id) };
  const kept = sel.order.length >= 3 ? sel.order.slice(0, 2) : sel.order;
  return { order: [...kept, id] };
}

/** Battle order number (1-based) for an id, or null when not selected. */
export function orderNumber(sel: Selection, id: string): number | null {
  const i = sel.order.indexOf(id);
  return i < 0 ? null : i + 1;
}

const NONE_SELECTED = 'No hero has been selected yet!';

function needThree(n: number): string {
  return `You must select 3 heroes.  Only ${String(n)} has been selected so far`;
}

/** Enable logic from legacy updateEnterBattlegroundButton / PracticeButton / PortalButton. */
export function buttonStates(chapter: number, selectedCount: number, testerTeam = false): ButtonStates {
  // Tester team: a battle needs 1 to 3 heroes in any chapter (the picker caps the selection at 3).
  const single = chapter <= 2 || testerTeam;
  const battleOk = selectedCount >= (single ? 1 : 3);
  return {
    battle: {
      enabled: battleOk,
      message: battleOk ? null : single ? NONE_SELECTED : needThree(selectedCount),
    },
    practice: { enabled: selectedCount > 0, message: selectedCount > 0 ? null : NONE_SELECTED },
    portal: { enabled: selectedCount >= 3, message: selectedCount >= 3 ? null : needThree(selectedCount) },
    portalVisible: chapter >= 4,
  };
}

/**
 * Display order: applies save.garrisonSortOrder. Legacy stored the setting but never applied it
 * (KNOWN-BUG garrison-sort-ignored); the new screen applies it by request.
 */
export function displayOrder(save: Pick<SaveV1, 'garrisonSortOrder' | 'garrison'>): GarrisonEntry[] {
  return sortGarrison(save.garrison as readonly GarrisonEntry[], save.garrisonSortOrder);
}

export interface RowView {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly xp: number;
  readonly element: string;
  readonly sprite: string;
}

export function rowView(entry: GarrisonEntry): RowView {
  const slug = entry.characterName.toLowerCase().replace(/ /g, '-');
  const def = CHARACTERS.find((c) => c.id === slug);
  return {
    id: entry.id,
    name: entry.characterName,
    level: levelFromXp(entry.experience),
    xp: entry.experience,
    element: def?.element ?? 'void',
    sprite: def?.sprite ?? 'dummyTarget',
  };
}

/** Builds the MatchSetup for a mode; heroes follow battle order. Returns null when not ready. */
export function buildMatchSetup(
  mode: MatchMode,
  save: Pick<SaveV1, 'chapter' | 'garrison'>,
  sel: Selection,
  meta: Sfc32,
  testerTeam = false,
): MatchSetup | null {
  const states = buttonStates(save.chapter, sel.order.length, testerTeam);
  if (!states[mode === 'battle' ? 'battle' : mode].enabled) return null;
  const heroes: GarrisonMemberV1[] = [];
  for (const id of sel.order) {
    const g = save.garrison.find((x) => x.id === id);
    if (g !== undefined) heroes.push(g);
  }
  if (heroes.length === 0) return null;
  const opponents =
    mode === 'battle'
      ? pickOpponents(heroes, meta)
      : mode === 'practice'
        ? [practiceOpponent(heroes)]
        : [portalOpponent()];
  return { mode, heroes, opponents };
}
