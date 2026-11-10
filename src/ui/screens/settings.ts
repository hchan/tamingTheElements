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
import { getRecordSetting, setRecordSetting } from '../../game/platform/record-setting';
import {
  applyPrefsToDocument,
  applyPrefsToSave,
  getPrefs,
  readOsPrefs,
  resolvePrefs,
  savedPrefs,
  setSavedPrefs,
  type OsA11y,
} from '../../game/platform/a11y/prefs';
import { parseBindings, setBindings } from '../../game/platform/input/bindings';
import { createSaveStore } from '../../game/platform/storage/create-save-store';
import { prepareExport, runImport } from '../../game/platform/storage/export-import';
import { canvasFraction } from '../display-scale';
import type { SaveStore } from '../../game/platform/storage/save-store';
import { el } from '../dom';
import type { Screen } from './screen';

const STORAGE_KEY = 'Taming the Elements';

/** Raw form values; radio values arrive as strings but are normalised to numbers. */
export interface SettingsForm {
  readonly difficulty: string | number;
  readonly displaySettings: string | number;
  readonly garrisonSortOrder: string | number;
  /** Accessibility checkboxes; absent means "leave the saved choice alone". */
  readonly reduceMotion?: boolean;
  readonly highContrast?: boolean;
}

function pick(table: Readonly<Record<string, number>>, raw: string | number, fallback: number): number {
  const n = typeof raw === 'number' ? raw : raw === '' ? Number.NaN : Number(raw);
  return Object.values(table).includes(n) ? n : fallback;
}

/** Pure: returns a new save with the form applied. Values are written as NUMBERS (legacy wrote strings). */
export function applySettings(save: SaveV1, form: SettingsForm, os: OsA11y = readOsPrefs()): SaveV1 {
  const base: SaveV1 = {
    ...save,
    difficulty: pick(DIFFICULTY, form.difficulty, save.difficulty),
    displaySettings: pick(DISPLAY_SCALE, form.displaySettings, save.displaySettings),
    garrisonSortOrder: pick(GARRISON_SORT_ORDER, form.garrisonSortOrder, save.garrisonSortOrder),
  };
  if (form.reduceMotion === undefined && form.highContrast === undefined) return base;
  const current = resolvePrefs(savedPrefs(save), os);
  return applyPrefsToSave(
    base,
    { reduceMotion: form.reduceMotion ?? current.reduceMotion, highContrast: form.highContrast ?? current.highContrast },
    os,
  );
}

/** Makes the saved accessibility choices take effect now (document attributes and the fx/HUD readers). */
export function applyA11y(save: SaveV1): void {
  setSavedPrefs(savedPrefs(save));
  applyPrefsToDocument(getPrefs());
}

export function applyUiScale(scale: number, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--ui-scale', String(scale));
  root.style.setProperty('--canvas-fraction', String(canvasFraction(scale)));
}

export function loadSave(): SaveV1 {
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

function checkbox(name: 'reduceMotion' | 'highContrast', label: string, hint: string, checked: boolean): HTMLElement {
  const row = el('div', 'settingsOption');
  const id = `setting-${name}`;
  const input = el('input');
  input.type = 'checkbox';
  input.name = name;
  input.id = id;
  input.checked = checked;
  input.setAttribute('aria-describedby', `${id}-hint`);
  const lab = el('label', undefined, label);
  lab.htmlFor = id;
  const note = el('div', 'info', hint);
  note.id = `${id}-hint`;
  row.append(input, ' ', lab, note);
  return row;
}

function accessibilityGroup(save: SaveV1): HTMLElement {
  const set = el('fieldset', 'settingsGroup');
  set.append(el('legend', 'heading', 'Accessibility'));
  const prefs = resolvePrefs(savedPrefs(save), readOsPrefs());
  set.append(
    checkbox(
      'reduceMotion',
      'Reduce motion',
      'Turns off screen shake, particles and spinning animations. Follows your device setting until you change it.',
      prefs.reduceMotion,
    ),
    checkbox(
      'highContrast',
      'High contrast',
      'Stronger borders and a colour-blind-safe palette for health bars and status icons.',
      prefs.highContrast,
    ),
  );
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
    reduceMotion: data.has('reduceMotion'),
    highContrast: data.has('highContrast'),
  };
}

function download(file: { filename: string; text: string }): void {
  const url = URL.createObjectURL(new Blob([file.text], { type: 'application/json' }));
  const a = el('a');
  a.href = url;
  a.download = file.filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export save / Import save buttons with a status line for validation errors. */
function transferControls(): HTMLElement {
  const box = el('div', 'settingsTransfer');
  const status = el('div', 'settingsStatus');
  status.setAttribute('role', 'status');
  const store = createSaveStore(() => Date.now());

  const exportBtn = el('button', 'menuButton', 'Export save');
  exportBtn.type = 'button';
  exportBtn.addEventListener('click', () => {
    void prepareExport(store).then((r) => {
      if (r.ok) {
        download(r.value);
        status.textContent = `Exported ${r.value.filename}`;
      } else {
        status.textContent = r.message;
      }
    });
  });

  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    void file
      .text()
      .then((text) =>
        runImport(store, text, () => window.confirm('Importing will overwrite your current save. Continue?')),
      )
      .then((out) => {
        if (out.status === 'imported') {
          applyUiScale(out.save.displaySettings);
          applyA11y(out.save);
          setBindings(parseBindings(out.save.keyBindings));
          status.textContent = 'Save imported.';
        } else {
          status.textContent = out.status === 'error' ? out.message : 'Import cancelled.';
        }
      })
      .catch((e: unknown) => {
        status.textContent = `Import failed: ${e instanceof Error ? e.message : String(e)}`;
      });
  });

  const importBtn = el('button', 'menuButton', 'Import save');
  importBtn.type = 'button';
  importBtn.addEventListener('click', () => {
    fileInput.click();
  });

  box.append(exportBtn, importBtn, fileInput, status);
  return box;
}

/** Immediate (not part of Save) checkbox: local-only playtest recording, default off. */
function recordControls(): HTMLElement {
  const box = el('div', 'settingsGroup');
  const row = el('label', 'settingsOption');
  const input = el('input');
  input.type = 'checkbox';
  input.id = 'recordPlaytests';
  input.checked = getRecordSetting();
  input.addEventListener('change', () => {
    setRecordSetting(input.checked);
  });
  row.append(input, ' Record playtests (kept on this device only)');
  const viewer = el('a', 'menuButton', 'Replay viewer');
  viewer.href = '#replay';
  box.append(row, viewer);
  return box;
}

/** `store` is the app's shared save store, so the battle (which loads from it) sees the same save. */
export function settingsScreen(store?: SaveStore): Screen {
  let node: HTMLElement | null = null;
  return {
    mount(container) {
      const save = loadSave();
      applyUiScale(save.displaySettings);
      applyA11y(save);
      node = el('div', 'menuPage');
      node.append(el('h1', 'heading', 'Settings'));
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
        accessibilityGroup(save),
      );
      const saveBtn = el('button', 'menuButton', 'Save');
      saveBtn.type = 'submit';
      const back = el('a', 'menuButton', 'Back');
      back.href = '#main';
      form.append(saveBtn, back);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const next = applySettings(save, readForm(form));
        applyUiScale(next.displaySettings);
        applyA11y(next);
        const done = (): void => {
          window.location.hash = '#main';
        };
        if (store) {
          void store.save(next).then(done);
          return;
        }
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* storage unavailable: still apply for this session */
        }
        done();
      });
      node.append(form, recordControls(), transferControls());
      container.append(node);
    },
    unmount() {
      node?.remove();
      node = null;
    },
  };
}
