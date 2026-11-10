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
  /** Any key press after the caption appears advances to this script id. */
  readonly next: string;
}
