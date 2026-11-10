import { describe, expect, it } from 'vitest';
import { manifestToLoadList } from './load-list';

describe('manifestToLoadList', () => {
  const m = {
    sprites: { fire: { url: 'img/fire.png' } },
    mapSprites: { slime: { url: 'img/map/slime.png' } },
    backgrounds: { air: { url: 'img/background/air.png' } },
    sounds: [{ id: 'whoosh', url: 'snd/whoosh.ogg' }],
  };

  it('prefixes base and namespaces keys', () => {
    expect(manifestToLoadList('/x/', m)).toEqual([
      { kind: 'image', key: 'sprite:fire', url: '/x/assets/img/fire.png' },
      { kind: 'image', key: 'map:slime', url: '/x/assets/img/map/slime.png' },
      { kind: 'image', key: 'bg:air', url: '/x/assets/img/background/air.png' },
      { kind: 'audio', key: 'snd:whoosh', url: '/x/assets/snd/whoosh.ogg' },
    ]);
  });

  it('adds a missing trailing slash to base', () => {
    expect(manifestToLoadList('/x', m)[0]?.url).toBe('/x/assets/img/fire.png');
  });

  it('covers the real manifest with unique keys and ogg audio', () => {
    const list = manifestToLoadList('/');
    expect(list.length).toBeGreaterThan(50);
    expect(new Set(list.map((e) => e.key)).size).toBe(list.length);
    expect(list.filter((e) => e.kind === 'audio').every((e) => e.url.endsWith('.ogg'))).toBe(true);
  });
});
