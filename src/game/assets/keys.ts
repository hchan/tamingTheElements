import type manifest from './manifest.generated.json';

/** Key unions derived from the generated legacy asset manifest. */
export type SpriteKey = keyof typeof manifest.sprites;
export type MapSpriteKey = keyof typeof manifest.mapSprites;
export type BackgroundKey = keyof typeof manifest.backgrounds;
export type SoundId = (typeof manifest.sounds)[number]['id'];
