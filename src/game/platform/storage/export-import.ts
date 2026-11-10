import { migrate, type SaveError, type SaveV1 } from '@core/index';
import type { SaveStore, StoreError } from './save-store';

export const EXPORT_FORMAT = 'tte-save';

export interface ExportEnvelope {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  savedAt: number;
  data: SaveV1;
}

export interface ExportFile {
  filename: string;
  text: string;
}

export type ImportOutcome =
  | { status: 'imported'; save: SaveV1 }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function exportFilename(savedAt: number): string {
  return `tte-save-${String(Math.trunc(savedAt))}.json`;
}

/** Pure: wraps a save in the download envelope. */
export function buildExport(save: SaveV1): ExportFile {
  const envelope: ExportEnvelope = {
    format: EXPORT_FORMAT,
    schemaVersion: save.schemaVersion,
    savedAt: save.savedAt,
    data: save,
  };
  return { filename: exportFilename(save.savedAt), text: JSON.stringify(envelope, null, 2) };
}

/** Human-readable text for a validation or storage error. */
export function describeError(error: StoreError | SaveError): string {
  switch (error.kind) {
    case 'future-version':
      return `This save was made by a newer version of the game (schema ${String(error.version)}) and cannot be imported.`;
    case 'invalid': {
      const shown = error.issues.slice(0, 3).join('; ');
      const more = error.issues.length > 3 ? ` (+${String(error.issues.length - 3)} more)` : '';
      return `The save file is invalid: ${shown}${more}`;
    }
    case 'corrupt':
      return `The file is not valid JSON: ${error.message}`;
    case 'storage':
      return `Could not access storage: ${error.message}`;
  }
}

/**
 * Pure: parses import text (an envelope or a bare legacy/v1 save), validates and migrates it.
 * Does not persist anything.
 */
export function parseImport(text: string): { ok: true; value: SaveV1 } | { ok: false; message: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, message: describeError({ kind: 'corrupt', message: e instanceof Error ? e.message : String(e) }) };
  }
  if (!isRecord(raw)) return { ok: false, message: 'The file does not contain a save object.' };
  let payload: unknown = raw;
  if ('format' in raw) {
    if (raw.format !== EXPORT_FORMAT) return { ok: false, message: `Unrecognised file format "${String(raw.format)}".` };
    if (!isRecord(raw.data)) return { ok: false, message: 'The save file has no "data" section.' };
    payload = raw.data;
  }
  const m = migrate(payload);
  return m.ok ? { ok: true, value: m.value } : { ok: false, message: describeError(m.error) };
}

/** Reads the current save and builds the download file. */
export async function prepareExport(store: SaveStore): Promise<{ ok: true; value: ExportFile } | { ok: false; message: string }> {
  const r = await store.exportJson();
  if (!r.ok) return { ok: false, message: describeError(r.error) };
  const m = parseImport(r.value);
  return m.ok ? { ok: true, value: buildExport(m.value) } : m;
}

/** Validates first, asks `confirmOverwrite`, and only then persists through the store. */
export async function runImport(
  store: SaveStore,
  text: string,
  confirmOverwrite: () => boolean | Promise<boolean>,
): Promise<ImportOutcome> {
  const parsed = parseImport(text);
  if (!parsed.ok) return { status: 'error', message: parsed.message };
  if (!(await confirmOverwrite())) return { status: 'cancelled' };
  const r = await store.importJson(JSON.stringify(parsed.value));
  return r.ok ? { status: 'imported', save: r.value } : { status: 'error', message: describeError(r.error) };
}
