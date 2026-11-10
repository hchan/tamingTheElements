/**
 * Cinematic script data types (append-only; the CinematicScene runner consumes these).
 * Scripts are pure data: no Phaser, no timers. Times are milliseconds, sizes are fractions
 * of the cinematic area's short side (legacy `cinematicAnimationShortLength`).
 */

export interface CineSprite {
  readonly id: string;
  /** Texture key (legacy imgMapAssets / imgAssets name). */
  readonly texture: string;
  /** Plays the texture's frame list once over this many ms (legacy SpriteAnimation reel). */
  readonly reelMs?: number;
  /** Width and height as a fraction of the short side of the cinematic area. */
  readonly size: number;
  /** Sprites are centered in the cinematic area. */
  readonly startAlpha: number;
  /** Optional growth/fade/rotation applied every `stepMs`. */
  readonly step?: CineStep;
}

export interface CineStep {
  readonly stepMs: number;
  /** Degrees added per step. */
  readonly rotateDeg?: number;
  /** Alpha multiplier per step. */
  readonly alphaMul?: number;
  /** Alpha added per step while alpha is below `alphaMax`. */
  readonly alphaAdd?: number;
  readonly alphaMax?: number;
  /** Size growth per step in legacy pixels (on each side: w and h grow by 2*grow). */
  readonly grow?: number;
  /** Stop growing once size reaches this multiple of the `sizeRefId` sprite's size. */
  readonly growUntilScale?: number;
  readonly sizeRefId?: string;
  /** Once alpha reaches this, each step applies `opaque` instead (legacy elemental-signs spin). */
  readonly opaqueAt?: number;
  readonly opaque?: { readonly rotateDeg: number; readonly shrink: number };
  /** Remove the sprite when its size falls below this fraction of the short side. */
  readonly removeBelowSize?: number;
}

/** Avatar fade loop: one slot per element, driven by the cosmetic rng (never the sim). */
export interface CineAvatarLoop {
  readonly elements: readonly string[];
  /** Avatar size as a fraction of the short side. */
  readonly size: number;
  readonly stepMs: number;
  readonly startAlpha: number;
  /** Degrees per step, direction picked by a coin flip. */
  readonly rotateDeg: number;
  /** Alpha multiplier while rising is `1 + rng() / 10 * 2`; once alpha >= `peakAlpha` it falls by `fallMul`. */
  readonly peakAlpha: number;
  readonly fallMul: number;
  /** Avatar is removed below this alpha and a new one is picked. */
  readonly removeBelowAlpha: number;
  /** A random slot is started every this many ms once the sprite spin has shrunk below half size. */
  readonly spawnEveryMs: number;
}

/** Closing beat of Restoring Balance: white flash, then pulsing evil eyes and a dark voice line. */
export interface CineFinale {
  readonly flashMs: number;
  readonly eyes: {
    readonly texture: string;
    readonly startAlpha: number;
    readonly growMul: number;
    readonly regrowMul: number;
    readonly peakAlpha: number;
    readonly fallMul: number;
    readonly regrowAtAlpha: number;
    readonly stepMs: number;
  };
  readonly voice: string;
}

export interface CineHeader {
  readonly text: string;
  /** Alpha lost per step; the header is removed when alpha <= `removeAtAlpha`. */
  readonly fadePerStep: number;
  readonly stepMs: number;
  readonly removeAtAlpha: number;
}

export interface CineCaption {
  readonly text: string;
  readonly startAlpha: number;
  readonly fadeInPerStep: number;
  readonly fadeInSteps: number;
  readonly stepMs: number;
  /** Prompt appended under the caption. */
  readonly prompt: string;
}

export interface CineScript {
  readonly id: string;
  /** Scene title, also shown as the header. */
  readonly title: string;
  /** Background texture key. */
  readonly background: string;
  readonly sprites: readonly CineSprite[];
  readonly header: CineHeader;
  /** Shown once the header is removed. */
  readonly caption: CineCaption;
  readonly avatars?: CineAvatarLoop;
  readonly finale?: CineFinale;
  /** Any key press after the caption appears advances to this script id. */
  readonly next: string;
}
