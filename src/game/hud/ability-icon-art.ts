import type Phaser from 'phaser';

/**
 * The approved AI-generated ability icons (`tools/assets/icon-gen/install-ai-ability-icons.py`, `public/assets/img/hud/ability-icons-ai/`).
 * An ability slot wears its icon in place of the ability's projectile sprite. Display only; the sim is untouched.
 * `tide_surge`, `whirlpool` and `heal_spring` are installed but have no ability yet (no sensible slot), so no sprite maps to them.
 * `quake`, `mist_veil`, `kelp_whip` and `gust` (procedural, `gen-procedural-icons.py`) are likewise installed without an ability. `skitter` failed review and is not installed.
 */

/** Icon slots in the folder, each a 128 px PNG named `<slot>.png`. */
export const AI_ICON_SLOTS = [
  'ember_bite', 'gale_talon', 'tide_surge', 'hurl_rock', 'lure_orb',
  'mycelium_mend', 'stinging_filament', 'stoop', 'forge_gore', 'tusk_gore', 'boulder_roll',
  'kelp_lash', 'molten_hide', 'whirlpool',
  'bell_pulse', 'heal_spring', 'scorch_breath', 'wyrm_coil', 'spore_burst',
  'cinder_spray', 'static_mote', 'quake', 'mist_veil', 'kelp_whip', 'gust', 'bristle_stomp',
] as const;
export type AiIconSlot = (typeof AI_ICON_SLOTS)[number];

/** Bar sprite key (`AbilityDef.sprite`) to the icon it wears. gale_talon is the air Talon Rake (Vortigal). */
const BY_SPRITE: Readonly<Record<string, AiIconSlot>> = {
  emberBite: 'ember_bite',
  talonRake: 'gale_talon',
  hurlRock: 'hurl_rock',
  lureOrb: 'lure_orb',
  myceliumMend: 'mycelium_mend',
  stingingFilament: 'stinging_filament',
  stoop: 'stoop',
  forgeGore: 'forge_gore',
  tuskGore: 'tusk_gore',
  boulderRoll: 'boulder_roll',
  kelpLash: 'kelp_lash',
  moltenHide: 'molten_hide',
  bellPulse: 'bell_pulse',
  scorchBreath: 'scorch_breath',
  wyrmCoil: 'wyrm_coil',
  sporeBurst: 'spore_burst',
  cinderSpray: 'cinder_spray',
  staticMote: 'static_mote',
  bristleStomp: 'bristle_stomp',
};

/** Phaser texture key of an icon slot. */
export const aiIconKey = (slot: AiIconSlot): string => `hud:ability:${slot}`;

/** Where an icon is served from, relative to the base URL. */
export const aiIconUrl = (slot: AiIconSlot): string => `assets/img/hud/ability-icons-ai/${slot}.png`;

/** The texture key a bar sprite's icon is loaded under, or undefined when the ability has no icon. */
export function aiIconKeyOfSprite(sprite: string): string | undefined {
  const slot = BY_SPRITE[sprite];
  return slot === undefined ? undefined : aiIconKey(slot);
}

interface Box { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/**
 * Dresses a bar image in the icon of `sprite`'s ability when it has one and its texture is loaded; false otherwise (the caller draws its usual icon).
 * `parts` is the dressed bar's icon box, else undefined and the icon fills the slot `s` (square, 1 px in).
 */
export function wearAiIcon(
  icon: Phaser.GameObjects.Image, sprite: string, textures: Phaser.Textures.TextureManager, parts: Box | undefined,
  s: { readonly x: number; readonly y: number; readonly size: number }, scale: number, wx: (x: number) => number, wy: (y: number) => number,
): boolean {
  const key = aiIconKeyOfSprite(sprite);
  if (key === undefined || !textures.exists(key)) return false;
  if (icon.texture.key !== key) icon.setTexture(key);
  const side = parts ? Math.min(parts.w, parts.h) : s.size - 2;
  const at = parts ? { x: parts.x + (parts.w - side) / 2, y: parts.y } : { x: s.x + 1, y: s.y + 1 };
  icon.setVisible(true).setPosition(wx(at.x), wy(at.y)).setDisplaySize(side * scale, side * scale);
  return true;
}
