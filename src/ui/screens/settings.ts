import {
  DEFAULT_DIFFICULTY,
  DEFAULT_DISPLAY_SCALE,
  DEFAULT_GARRISON_SORT_ORDER,
  DIFFICULTY,
  DISPLAY_SCALE,
  GARRISON_SORT_ORDER,
  migrate,
  newEmptyState,
  type SaveV1,
} from '@core/index';
import { el } from '../dom';
import type { Screen } from './screen';

const STORAGE_KEY = 'Taming the Elements';

/** Raw form values; radio values arrive as strings but are normalised to numbers. */
export interface SettingsForm {
  readonly difficulty: string | number;
  readonly displaySettings: string | number;
  readonly garrisonSortOrder: string | number;
}

function pick(table: Readonly<Record<string, number>>, raw: string | number, fallback: number): number {
  const n = typeof raw === 'number' ? raw : raw === '' ? Number.NaN : Number(raw);
  return Object.values(table).includes(n) ? n : fallback;
}

/** Pure: returns a new save with the form applied. Values are written as NUMBERS (legacy wrote strings). */
export function applySettings(save: SaveV1, form: SettingsForm): SaveV1 {
  return {
    ...save,
    difficulty: pick(DIFFICULTY, form.difficulty, save.difficulty),
    displaySettings: pick(DISPLAY_SCALE, form.displaySettings, save.displaySettings),
    garrisonSortOrder: pick(GARRISON_SORT_ORDER, form.garrisonSortOrder, save.garrisonSortOrder),
  };
}

export function applyUiScale(scale: number, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--ui-scale', String(scale));
}

function loadSave(): SaveV1 {
  let raw: unknown;
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    raw = text === null ? null : JSON.parse(text);
  } catch {
    raw = null;
  }
  const r = migrate(raw);
  return r.ok ? r.value : newEmptyState();
}

function radioGroup(
  name: keyof SettingsForm,
  legend: string,
  table: Readonly<Record<string, number>>,
  current: number,
  fallback: number,
): HTMLElement {
  const set = el('fieldset', 'settingsGroup');
  set.append(el('legend', 'heading', legend));
  const selected = Object.values(table).includes(current) ? current : fallback;
  for (const [label, value] of Object.entries(table)) {
    const row = el('label', 'settingsOption');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.value = String(value);
    input.checked = value === selected;
    row.append(input, ` ${label}`);
    set.append(row);
  }
  return set;
}

function readForm(form: HTMLFormElement): SettingsForm {
  const data = new FormData(form);
  const get = (k: keyof SettingsForm): string => {
    const v = data.get(k);
    return typeof v === 'string' ? v : '';
  };
  return {
    difficulty: get('difficulty'),
    displaySettings: get('displaySettings'),
    garrisonSortOrder: get('garrisonSortOrder'),
  };
}

export function settingsScreen(): Screen {
  let node: HTMLElement | null = null;
  return {
    mount(container) {
      const save = loadSave();
      applyUiScale(save.displaySettings);
      node = el('div', 'menuPage');
      node.append(el('div', 'heading', 'Settings'));
      const form = el('form', 'settingsForm');
      form.append(
        radioGroup('difficulty', 'Difficulty', DIFFICULTY, save.difficulty, DEFAULT_DIFFICULTY),
        radioGroup('displaySettings', 'Display Size', DISPLAY_SCALE, save.displaySettings, DEFAULT_DISPLAY_SCALE),
        radioGroup(
          'garrisonSortOrder',
          'Garrison Sort Order',
          GARRISON_SORT_ORDER,
          save.garrisonSortOrder,
          DEFAULT_GARRISON_SORT_ORDER,
        ),
      );
      const saveBtn = el('button', 'menuButton', 'Save');
      saveBtn.type = 'submit';
      const back = el('a', 'menuButton', 'Back');
      back.href = '#main';
      form.append(saveBtn, back);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const next = applySettings(save, readForm(form));
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* storage unavailable: still apply for this session */
        }
        applyUiScale(next.displaySettings);
        window.location.hash = '#main';
      });
      node.append(form);
      container.append(node);
    },
    unmount() {
      node?.remove();
      node = null;
    },
  };
}
