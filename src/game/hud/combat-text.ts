import type Phaser from 'phaser';

/**
 * One look for the in-fight call-outs (damage numbers, the hit counter, TAG!, CHARGE! and the other pops): a desaturated
 * warm-bone serif (the engraved style of the super titles) under a THIN dark outline, with a soft glow in the tone's colour
 * instead of a thick black rim, so it reads on the painted floors without looking like a flat cartoon sticker (QA r21).
 */
export type CombatTone = 'number' | 'scaled' | 'counter' | 'combo' | 'call' | 'ko';

export interface CombatLook {
  readonly color: string;
  /** Outline width in px (was 5 to 8 when the text was flat). */
  readonly outline: number;
  readonly glow: string;
  readonly glowBlur: number;
}

export const COMBAT_FONT = 'Georgia, "Times New Roman", serif';
export const COMBAT_OUTLINE = '#0a0806';

export const COMBAT_LOOKS: Readonly<Record<CombatTone, CombatLook>> = {
  number: { color: '#f4ecd8', outline: 4, glow: '#000000', glowBlur: 8 },
  scaled: { color: '#c4c0b4', outline: 4, glow: '#000000', glowBlur: 5 },
  counter: { color: '#e6c577', outline: 3, glow: '#d9a040', glowBlur: 10 },
  combo: { color: '#e9d59c', outline: 3, glow: '#d9a850', glowBlur: 10 },
  call: { color: '#ece4d2', outline: 4, glow: '#cfe0f0', glowBlur: 12 },
  ko: { color: '#dcbc68', outline: 4, glow: '#e8a838', glowBlur: 14 },
};

/** Whether `color` (a `#rrggbb` string) is a pale, low-saturation tone: the fills must never go back to a saturated flat yellow or pure white. */
export function isMutedLight(color: string): boolean {
  const n = parseInt(color.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  return hi >= 150 && (hi === 0 ? 0 : (hi - lo) / hi) <= 0.55 && color.toLowerCase() !== '#ffffff';
}

/** Applies the tone to `t`: serif face, tone fill, thin dark outline and the soft tone glow (shadow on the fill only, no hard drop). */
export function styleCombatText(t: Phaser.GameObjects.Text, tone: CombatTone, tint?: string): Phaser.GameObjects.Text {
  const l = COMBAT_LOOKS[tone];
  return t
    .setFontFamily(COMBAT_FONT)
    .setColor(tint ?? l.color)
    .setStroke(COMBAT_OUTLINE, l.outline)
    .setShadow(0, 0, l.glow, l.glowBlur, false, true);
}
