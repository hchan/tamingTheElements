/**
 * Per-bus volume the player chose in Settings (music, sfx). Device-local like the mute flag and the touch layout: kept in
 * localStorage (sync, never the async IndexedDB save), so a battle reads it when its audio is built. 0..1, default 1.
 */
export const VOLUME_BUSES = ['music', 'sfx'] as const;
export type VolumeBus = (typeof VOLUME_BUSES)[number];
export type Volumes = Readonly<Record<VolumeBus, number>>;

export const VOLUME_KEY = 'tte.volumes';
export const DEFAULT_VOLUMES: Volumes = { music: 1, sfx: 1 };

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const clamp01 = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

/** Reads the stored volumes; anything unrecognised falls back to full volume for that bus. */
export function readVolumes(store: Pick<Store, 'getItem'> | undefined): Volumes {
  try {
    const raw = store?.getItem(VOLUME_KEY);
    if (raw === null || raw === undefined) return DEFAULT_VOLUMES;
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    return { music: clamp01(o?.['music'], 1), sfx: clamp01(o?.['sfx'], 1) };
  } catch {
    return DEFAULT_VOLUMES;
  }
}

/** Stores one bus's volume (clamped to 0..1) and returns the new set; a storage failure only loses persistence. */
export function writeVolume(bus: VolumeBus, v: number, store: Store | undefined): Volumes {
  const next = { ...readVolumes(store), [bus]: clamp01(v, 1) };
  try {
    store?.setItem(VOLUME_KEY, JSON.stringify(next));
  } catch {
    // not persisted; nothing else to do
  }
  return next;
}
