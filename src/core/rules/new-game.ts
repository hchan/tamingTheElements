/** New-game save (legacy GamePersist.saveStart): a random race at XP 1, chapter 1, default settings. */
import { CHARACTERS } from '../data/characters';
import {
  DEFAULT_DIFFICULTY,
  DISPLAY_SCALE,
  DEFAULT_GARRISON_SORT_ORDER,
} from '../data/settings';
import { CHARACTER_TEXT } from '../data/text-ids';
import type { Sfc32 } from '../rng/sfc32';
import type { SaveV1 } from '../save/v1';
import { metaIdSource } from './garrison';
import type { Clock } from './garrison';

export function newGame(meta: Sfc32, clock: Clock): SaveV1 {
  const character = meta.pick(CHARACTERS);
  const characterName = CHARACTER_TEXT.get(character.id)?.name ?? character.id;
  const id = metaIdSource(meta).next();
  const now = clock.now();
  return {
    schemaVersion: 1,
    savedAt: now,
    chapter: 1,
    garrisonSortOrder: DEFAULT_GARRISON_SORT_ORDER,
    difficulty: DEFAULT_DIFFICULTY,
    displaySettings: DISPLAY_SCALE.Largest, // new players start at Largest; stored saves keep theirs
    garrison: [{ id, experience: 1, characterName, createdTime: now, lastModifiedTime: now }],
    createdTime: now,
    lastModifiedTime: now,
  };
}
