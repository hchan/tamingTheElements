import manifest from '../assets/manifest.generated.json';
import type { CineScript } from '../cine/types';
import type { CinematicScript, CinematicStep, Rect } from './runner';
import { CALL_OF_THE_TAMER_SCRIPT } from './scripts/call-of-the-tamer';
import { DISTURBANCE_SCRIPT } from './scripts/disturbance';
import { PRIA_SCRIPT } from './scripts/pria';
import { RESTORING_BALANCE_SCRIPT } from './scripts/restoring-balance';

const W = 1280;
const H = 720;
const SHORT = Math.min(W, H);
const HEADER_MS = 2000;
const SPRITE_MS = 4000;
const VOICE_MS = 2500;

/** Legacy story order (scenes.js): each scene's key press starts the next one. */
export const STORY_CHAIN: readonly CineScript[] = [
  PRIA_SCRIPT,
  DISTURBANCE_SCRIPT,
  CALL_OF_THE_TAMER_SCRIPT,
  RESTORING_BALANCE_SCRIPT,
];

/** Texture name -> load-list key (`sprite:`, `map:` or `bg:` namespace). */
export function textureKey(name: string, background = false): string {
  if (background) return `bg:${name}`;
  if (name in manifest.sprites) return `sprite:${name}`;
  if (name in manifest.mapSprites) return `map:${name}`;
  return `bg:${name}`;
}

function centered(size: number, dx = 0, dy = 0): Rect {
  const s = SHORT * size;
  return { x: (W - s) / 2 + dx, y: (H - s) / 2 + dy, w: s, h: s };
}

/**
 * Turns one data script into runner steps. This keeps the legacy captions, headers, sprites and order;
 * the per-frame fades and spins are approximated by a single tween per sprite (cosmetic only).
 */
export function cineToSteps(s: CineScript): CinematicStep[] {
  const out: CinematicStep[] = [{ kind: 'clear' }, { kind: 'background', key: textureKey(s.background, true) }];
  for (const sp of s.sprites) {
    out.push({ kind: 'sprite', id: sp.id, key: textureKey(sp.texture), rect: centered(sp.size), alpha: sp.startAlpha });
    const step = sp.step;
    const to = {
      alpha: step?.alphaMax ?? (step?.alphaMul !== undefined || step?.opaqueAt !== undefined ? 1 : sp.startAlpha),
      ...(step?.rotateDeg !== undefined || step?.opaque !== undefined ? { spin: 40 } : {}),
      ...(step?.grow !== undefined ? centered(sp.size * 1.5) : {}),
    };
    out.push({ kind: 'tween', id: sp.id, to, ms: SPRITE_MS });
  }
  const av = s.avatars;
  if (av) {
    av.elements.forEach((e, i) => {
      const dx = (i % 2 === 0 ? -1 : 1) * SHORT * 0.4;
      const dy = (i < 2 ? -1 : 1) * SHORT * 0.25;
      out.push({ kind: 'sprite', id: `avatar-${e}`, key: textureKey(e), rect: centered(av.size, dx, dy), alpha: av.startAlpha });
      out.push({ kind: 'tween', id: `avatar-${e}`, to: { alpha: av.peakAlpha }, ms: SPRITE_MS });
    });
  }
  out.push({ kind: 'header', text: s.header.text, ms: HEADER_MS });
  if (s.finale) {
    const f = s.finale.eyes;
    out.push({ kind: 'sprite', id: 'eyes', key: textureKey(f.texture), rect: centered(0.4), alpha: f.startAlpha });
    out.push({ kind: 'tween', id: 'eyes', to: { alpha: f.peakAlpha }, ms: VOICE_MS });
    out.push({ kind: 'caption', text: s.finale.voice }, { kind: 'wait', ms: VOICE_MS });
  }
  out.push({ kind: 'caption', text: `${s.caption.text.replace(/<br\/>/g, '\n')}\n\n${s.caption.prompt}` });
  out.push({ kind: 'waitKey' });
  return out;
}

/** Scripts `from..to` (inclusive indices into the story chain) as one runnable cinematic. */
export function storySteps(from = 0, to = STORY_CHAIN.length - 1): CinematicScript {
  return STORY_CHAIN.slice(from, to + 1).flatMap(cineToSteps);
}

/** Legacy "New Game": the full chain, Pria -> The Disturbance -> Call of the Tamer -> Restoring Balance. */
export const NEW_GAME_SCRIPT: CinematicScript = storySteps();
