import manifest from './manifest.generated.json';

export type LoadKind = 'image' | 'audio';

export interface LoadEntry {
  readonly kind: LoadKind;
  /** Phaser cache key, namespaced by kind: `sprite:`, `map:`, `bg:`, `snd:`. */
  readonly key: string;
  /** Final URL including the base prefix. */
  readonly url: string;
}

interface ManifestShape {
  readonly sprites: Readonly<Record<string, { readonly url: string }>>;
  readonly mapSprites: Readonly<Record<string, { readonly url: string }>>;
  readonly backgrounds: Readonly<Record<string, { readonly url: string }>>;
  readonly sounds: readonly { readonly id: string; readonly url: string }[];
}

/** Manifest URLs are relative to `assets/`; `base` is Vite's BASE_URL (e.g. "/" or "/repo/"). */
function join(base: string, url: string): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}assets/${url}`;
}

/** Pure: flatten the manifest into an ordered, deduplicated load list (ogg only for now). */
export function manifestToLoadList(base: string, m: ManifestShape = manifest): LoadEntry[] {
  const out: LoadEntry[] = [];
  const seen = new Set<string>();
  const add = (kind: LoadKind, key: string, url: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, key, url: join(base, url) });
  };
  for (const [k, v] of Object.entries(m.sprites)) add('image', `sprite:${k}`, v.url);
  for (const [k, v] of Object.entries(m.mapSprites)) add('image', `map:${k}`, v.url);
  for (const [k, v] of Object.entries(m.backgrounds)) add('image', `bg:${k}`, v.url);
  for (const s of m.sounds) add('audio', `snd:${s.id}`, s.url);
  return out;
}
