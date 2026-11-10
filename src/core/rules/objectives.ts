/** Chapter objectives, progress text and chapter advancement (legacy Garrison.* parity). */

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

/** Legacy Garrison.getLevel; ch1..ch3 XP caps are 5, 20 and 50. */
function levelOf(experience: number): number {
  if (experience < 5) return experience;
  if (experience < 20) return 5 + Math.floor((experience - 5) / 3);
  if (experience < 50) return 10 + Math.floor((experience - 20) / 6);
  return 15 + Math.floor((experience - 50) / 10);
}

function isComplete(save: ObjectivesSave): boolean {
  return save.completeTime != null;
}

function countAtLevel(save: ObjectivesSave, level: number): number {
  let n = 0;
  for (const c of save.garrison) if (levelOf(c.experience) === level) n++;
  return n;
}

/** Legacy oddities kept: chapter 1 needs level exactly 5; chapters 2/3 count characters at exactly level 10/15. */
export function objectivesMet(save: ObjectivesSave | null): boolean {
  if (save === null) return false;
  switch (save.chapter) {
    case 1: {
      const first = save.garrison[0];
      return first !== undefined && levelOf(first.experience) === 5;
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
      const level = levelOf(first.experience);
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
