/** Chapter objectives, progress text and chapter advancement (legacy Garrison.* parity). */
import { levelFromXp } from './progression';

/** Minimal save shape the objective rules read. */
export interface ObjectivesSave {
  readonly chapter: number;
  readonly garrison: readonly { readonly experience: number }[];
  /** Set once the game has been completed (legacy `completeTime != null`). */
  readonly completeTime?: number | null;
}

export interface ProgressLine {
  readonly text: string;
}

function isComplete(save: ObjectivesSave): boolean {
  return save.completeTime != null;
}

function countAtLevel(save: ObjectivesSave, level: number): number {
  let n = 0;
  for (const c of save.garrison) if (levelFromXp(c.experience) === level) n++;
  return n;
}

/** Legacy oddities kept: chapter 1 needs level exactly 5; chapters 2/3 count characters at exactly level 10/15. */
export function objectivesMet(save: ObjectivesSave | null): boolean {
  if (save === null) return false;
  switch (save.chapter) {
    case 1: {
      const first = save.garrison[0];
      return first !== undefined && levelFromXp(first.experience) === 5;
    }
    case 2:
      return countAtLevel(save, 10) >= 3;
    case 3:
      return countAtLevel(save, 15) >= 3;
    case 4:
      return isComplete(save);
    default:
      return false;
  }
}

function levelLine(save: ObjectivesSave, level: number): ProgressLine {
  const count = countAtLevel(save, level);
  const base = `Number of Level ${String(level)} Characters: ${String(count)}`;
  return {
    text:
      count < 3
        ? `${base} - you need to level ${String(3 - count)} more characters to Level ${String(level)}`
        : `${base} - objective complete`,
  };
}

/** Structured progress lines (no HTML); empty when there is nothing to show. */
export function progress(save: ObjectivesSave | null): readonly ProgressLine[] {
  if (save === null) return [];
  switch (save.chapter) {
    case 1: {
      const first = save.garrison[0];
      if (first === undefined) return [];
      const level = levelFromXp(first.experience);
      return [
        { text: `Current level of your elemental in your Garrison : ${String(level)}` },
        { text: `You need to level this elemental ${String(5 - level)} level(s) to meet the objectives of this chapter` },
      ];
    }
    case 2: {
      const size = save.garrison.length;
      const base = `Garrison size: ${String(size)}`;
      return [
        {
          text:
            size < 3
              ? `${base} - you need to capture ${String(3 - size)} more characters`
              : `${base} - objective complete`,
        },
        levelLine(save, 10),
      ];
    }
    case 3:
      return [levelLine(save, 15)];
    case 4:
      return isComplete(save)
        ? []
        : [{ text: 'The dark menace still awaits you on the other side of the portal ...' }];
    default:
      return [];
  }
}

/** Returns the next chapter number: a completed game jumps to 5, otherwise chapter + 1 (no cap). */
export function advanceChapter(save: ObjectivesSave): number {
  return isComplete(save) ? 5 : save.chapter + 1;
}
