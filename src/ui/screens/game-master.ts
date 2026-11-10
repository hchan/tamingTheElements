/**
 * DEV/test-only game master (legacy GameMaster): view and edit the save JSON and apply chapter presets.
 * The router only wires this behind `import.meta.env.DEV || MODE === 'test'`, so production drops it.
 */
import {
  CHAPTERS,
  CHARACTERS,
  CHARACTER_TEXT,
  type CharacterId,
  DEFAULT_DIFFICULTY,
  DEFAULT_DISPLAY_SCALE,
  DEFAULT_GARRISON_SORT_ORDER,
  metaIdSource,
  migrate,
  seedSfc32,
  type Sfc32,
  type SaveV1,
} from '@core/index';
import { el } from '../dom';
import type { Screen } from './screen';

const STORAGE_KEY = 'Taming the Elements';

export type Preset = 2 | 3 | 4 | 'complete';
export const PRESETS: readonly Preset[] = [2, 3, 4, 'complete'];

function maxXp(chapter: number): number {
  return CHAPTERS.find((c) => c.chapter === chapter)?.maxXp ?? 0;
}

function nameOf(id: CharacterId): string {
  return CHARACTER_TEXT.get(id)?.name ?? id;
}

/** Pure: builds a v1 save like legacy chapterHelper (5 random characters at cap-1) or chapterComplete (all at cap). */
export function buildPreset(preset: Preset, meta: Sfc32, now: number): SaveV1 {
  const ids = metaIdSource(meta);
  const chapter = preset === 'complete' ? 4 : preset;
  const entry = (characterName: string, experience: number): SaveV1['garrison'][number] => ({
    id: ids.next(),
    experience,
    characterName,
    createdTime: now,
    lastModifiedTime: now,
  });
  const garrison: SaveV1['garrison'] = [];
  if (preset === 'complete') {
    for (const c of CHARACTERS) garrison.push(entry(nameOf(c.id), maxXp(4)));
  } else {
    for (let i = 0; i < 5; i++) garrison.push(entry(nameOf(meta.pick(CHARACTERS).id), maxXp(chapter) - 1));
  }
  return {
    schemaVersion: 1,
    savedAt: now,
    chapter,
    garrisonSortOrder: DEFAULT_GARRISON_SORT_ORDER,
    difficulty: DEFAULT_DIFFICULTY,
    displaySettings: DEFAULT_DISPLAY_SCALE,
    garrison,
    createdTime: now,
    lastModifiedTime: now,
  };
}

/** Pure: parses and validates editor text; empty text means "clear the save". */
export function parseEditorText(text: string): { ok: true; save: SaveV1 | null } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, save: null };
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, message: 'Invalid save: expected a JSON object' };
  }
  const r = migrate(raw);
  return r.ok ? { ok: true, save: r.value } : { ok: false, message: `Invalid save: ${JSON.stringify(r.error)}` };
}

function readStored(): string {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (text === null) return '';
    const r = migrate(JSON.parse(text));
    return JSON.stringify(r.ok ? r.value : JSON.parse(text), undefined, 2);
  } catch {
    return '';
  }
}

export function gameMasterScreen(): Screen {
  let node: HTMLElement | null = null;
  return {
    mount(container) {
      node = el('div', 'menuPage');
      node.append(el('h1', 'heading', 'Game Master'));
      const area = el('textarea');
      area.id = 'gameMasterTextArea';
      area.setAttribute('aria-label', 'Save JSON');
      area.rows = 24;
      area.cols = 80;
      area.value = readStored();
      const status = el('div', 'settingsStatus');
      status.setAttribute('role', 'status');

      const write = (save: SaveV1 | null): void => {
        if (save === null) window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
      };
      const button = (label: string, onClick: () => void): HTMLButtonElement => {
        const b = el('button', 'menuButton', label);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
      };

      const buttons: HTMLElement[] = [
        button('Apply JSON', () => {
          const r = parseEditorText(area.value);
          if (!r.ok) {
            status.textContent = r.message;
            return;
          }
          write(r.save);
          status.textContent = r.save === null ? 'Save cleared.' : 'Save written.';
        }),
        button('Reload', () => {
          area.value = readStored();
          status.textContent = 'Reloaded.';
        }),
        button('Clear', () => {
          area.value = '';
          write(null);
          status.textContent = 'Save cleared.';
        }),
      ];
      for (const p of PRESETS) {
        const label = p === 'complete' ? 'Chapter complete' : `Chapter ${String(p)}`;
        buttons.push(
          button(label, () => {
            const now = Date.now();
            const save = buildPreset(p, seedSfc32(now >>> 0, 'meta'), now);
            write(save);
            area.value = JSON.stringify(save, undefined, 2);
            status.textContent = `${label} preset written.`;
          }),
        );
      }
      const back = el('a', 'menuButton', 'Back');
      back.href = '#main';
      node.append(area, el('div'), ...buttons, back, status);
      container.append(node);
    },
    unmount() {
      node?.remove();
      node = null;
    },
  };
}
