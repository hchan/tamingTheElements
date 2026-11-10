import { describe, expect, it } from 'vitest';
import rules from '../../../tests/fixtures/legacy/rules.json';
import { advanceChapter, objectivesMet, progress, type ObjectivesSave } from './objectives';

interface Case {
  met: boolean;
  progress: string;
}
const objectives = rules.objectives as Record<string, Case>;
const addChapter = rules.addChapter as Record<string, number>;

/** Re-render structured lines the way legacy HTML did. */
function legacyText(chapter: number, lines: readonly { text: string }[]): string {
  const texts = lines.map((l) => l.text);
  return chapter === 2 || chapter === 3 ? texts.map((t) => `${t}<br/>`).join('') : texts.join('<br/>');
}

function parseKey(key: string): ObjectivesSave | null {
  if (key === 'noSave') return null;
  const parts = key.split('|');
  const chapter = Number((parts[0] ?? '').slice(2));
  const complete = key.endsWith('|complete');
  let xps: number[];
  if (chapter === 1) xps = [Number((parts[1] ?? '').slice(2))];
  else if (chapter === 2 || chapter === 3) xps = (parts[2] ?? '').split(',').map(Number);
  else xps = chapter === 4 ? [100, 100, 100] : [100];
  return {
    chapter,
    garrison: xps.map((experience) => ({ experience })),
    ...(complete ? { completeTime: 1 } : {}),
  };
}

describe('objectives vs legacy rules.json', () => {
  for (const [key, expected] of Object.entries(objectives)) {
    it(key, () => {
      const save = parseKey(key);
      expect(objectivesMet(save)).toBe(expected.met);
      const lines = progress(save);
      expect(legacyText(save?.chapter ?? 0, lines)).toBe(expected.progress);
      for (const l of lines) expect(l.text).not.toContain('<');
    });
  }
});

describe('advanceChapter', () => {
  for (const [key, expected] of Object.entries(addChapter)) {
    it(key, () => {
      const m = /^ch(\d)\|complete(true|false)$/.exec(key);
      const save: ObjectivesSave = {
        chapter: Number(m?.[1]),
        garrison: [],
        ...(m?.[2] === 'true' ? { completeTime: 1 } : {}),
      };
      expect(advanceChapter(save)).toBe(expected);
    });
  }
});
