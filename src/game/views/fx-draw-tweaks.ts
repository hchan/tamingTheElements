/**
 * View-only in-game readability tweaks for fx sprites the art-director found weak (ideas/brainstorm/fx-ingame-scale-tweaks.md):
 * a larger DRAWN size, full alpha and additive blend. The sim hit box (w/h) is never touched; the projectile view applies this after
 * it has worked out the drawn size. No Phaser import, so it is unit-testable.
 */
export interface FxDrawTweak {
  /** Multiplier on the drawn width and height. */
  readonly scale: number;
  /** Floor for the drawn alpha (1 = fully opaque). */
  readonly minAlpha: number;
  /** Multiplier applied after the floor (abyssFlash 0.9 keeps some teal in the core). */
  readonly alphaMul: number;
  /** Draw with additive blending (the sprite glows instead of reading as a dark box). */
  readonly additive: boolean;
  /** Optional tint multiplied into the art (pale teal lifts a dark-teal sprite off its own caster). */
  readonly tint?: number;
}

export const FX_DRAW_TWEAKS: Readonly<Record<string, FxDrawTweak>> = {
  cinderSpray: { scale: 1.5, minAlpha: 1, alphaMul: 1, additive: true },
  abyssFlash: { scale: 1.8, minAlpha: 0, alphaMul: 0.9, additive: true },
  // The 8-frame loop is a dark-teal worm that starts inside Abyssor's teal body: bigger, lighter, additive pale teal.
  abyssalPull: { scale: 1.5, minAlpha: 0, alphaMul: 0.9, additive: true, tint: 0xbff4f0 },
};

/** Abyssal Pull procedural tendril: it starts this many px from the caster (was 8) so it does not pile onto the sprite/body. */
export const PULL_TENDRIL_START_PX = 44;

/**
 * Brazgor Forge Gore: the approved 80x60 art is an arc bulging UP (not symmetric, but drawn stretched over the 70x80 box it read as a
 * starburst). Drawn instead at its own aspect, turned so the bulge points along the attack heading, `forwardPx` ahead of the hero.
 */
export const FORGE_GORE_LOOK = { w: 80, h: 60, scale: 0.85, forwardPx: 20 } as const;

/** Unit vectors for the 8 headings (0 east, 2 north, 4 west, 6 south; screen y down). */
const HEADING: readonly (readonly [number, number])[] = [[1, 0], [0.7071, -0.7071], [0, -1], [-0.7071, -0.7071], [-1, 0], [-0.7071, 0.7071], [0, 1], [0.7071, 0.7071]];

export interface ForgeGoreLook { readonly angle: number; readonly w: number; readonly h: number; readonly dx: number; readonly dy: number }

/** Drawn angle (degrees, clockwise), size and forward offset for Forge Gore heading `dir`; the bulge-up art turns +90 deg to point along the heading. */
export function forgeGoreLook(dir: number): ForgeGoreLook {
  const d = ((Math.round(dir) % 8) + 8) % 8;
  const [ux, uy] = HEADING[d] ?? [1, 0];
  const { w, h, scale, forwardPx } = FORGE_GORE_LOOK;
  return { angle: (360 - d * 45 + 90) % 360, w: w * scale, h: h * scale, dx: ux * forwardPx, dy: uy * forwardPx };
}

export interface FxDrawResult { readonly w: number; readonly h: number; readonly alpha: number; readonly additive: boolean }

/** The drawn size, alpha and blend for `sprite`; unlisted sprites come back unchanged. */
export function applyFxTweak(sprite: string, w: number, h: number, alpha: number): FxDrawResult {
  const t = FX_DRAW_TWEAKS[sprite];
  if (!t) return { w, h, alpha, additive: false };
  return { w: w * t.scale, h: h * t.scale, alpha: Math.max(alpha, t.minAlpha) * t.alphaMul, additive: t.additive };
}
