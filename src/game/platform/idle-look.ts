// Type-only import, erased at build: the menu chunk gets no core runtime from this file (it is read from src/ui too).
// Never import core values here.
import type { Element } from '@core/index';

/**
 * Per-hero idle look (idea idle-element-auras): which element aura a hero stands in and which body motif and particle
 * signature it adds. Pure data, no Phaser, no clock; read by the arena view (src/game/fx/idle-aura*.ts, views/idle-motif.ts)
 * and by the menu showcase CSS. A new hero needs one row here, or nothing: the element default applies.
 */
export type IdleElement = Element;
export type IdleMotifKind = 'none' | 'hover' | 'heave' | 'wingFlex' | 'sway' | 'wobble' | 'pulse';
export type IdleSignature =
  | 'none' | 'emberCrown' | 'moltenSeams' | 'smokeBreath' | 'frostBreath' | 'slimeBubbles' | 'icicleDrips'
  | 'rubbleGlow' | 'hoverPebbles' | 'fallingLeaves' | 'baseDust' | 'afterimage' | 'sonarPing' | 'inwardMotes';

export interface IdleLook {
  readonly element: IdleElement | 'none';
  readonly signature: IdleSignature;
  readonly motif: IdleMotifKind;
  /** 0..1 overall intensity. */
  readonly amount: number;
  /** Mouth anchor as box fractions [0..1], east-facing (mirrored for west). */
  readonly mouth?: readonly [number, number];
}

const NONE: IdleLook = { element: 'none', signature: 'none', motif: 'none', amount: 0 };

/** What a hero of an element gets when it has no row of its own (so the 24-hero roster needs no code). */
export const ELEMENT_IDLE_DEFAULTS: Readonly<Record<IdleElement, IdleLook>> = {
  fire: { element: 'fire', signature: 'emberCrown', motif: 'hover', amount: 1 },
  water: { element: 'water', signature: 'icicleDrips', motif: 'heave', amount: 0.9 },
  earth: { element: 'earth', signature: 'rubbleGlow', motif: 'heave', amount: 1 },
  air: { element: 'air', signature: 'baseDust', motif: 'none', amount: 1 },
  void: { element: 'void', signature: 'inwardMotes', motif: 'none', amount: 0.8 },
};

/** By sprite id. */
export const IDLE_LOOKS: Readonly<Record<string, IdleLook>> = {
  fiara: { element: 'fire', signature: 'emberCrown', motif: 'hover', amount: 1 },
  lavax: { element: 'fire', signature: 'moltenSeams', motif: 'heave', amount: 0.7 },
  sindarosa: { element: 'fire', signature: 'smokeBreath', motif: 'wingFlex', amount: 1, mouth: [0.8, 0.3] },
  curomo: { element: 'water', signature: 'frostBreath', motif: 'wingFlex', amount: 0.9, mouth: [0.8, 0.3] },
  ishimi: { element: 'water', signature: 'slimeBubbles', motif: 'wobble', amount: 0.9 },
  morblass: { element: 'water', signature: 'icicleDrips', motif: 'heave', amount: 0.9 },
  pax: { element: 'earth', signature: 'rubbleGlow', motif: 'heave', amount: 1 },
  rokcore: { element: 'earth', signature: 'hoverPebbles', motif: 'heave', amount: 1 },
  treenoc: { element: 'earth', signature: 'fallingLeaves', motif: 'sway', amount: 1 },
  cyclonius: { element: 'air', signature: 'baseDust', motif: 'none', amount: 1 },
  echo: { element: 'air', signature: 'afterimage', motif: 'none', amount: 0.8 },
  wispera: { element: 'air', signature: 'sonarPing', motif: 'pulse', amount: 0.8 },
  eternalVoid: { element: 'void', signature: 'inwardMotes', motif: 'none', amount: 0.8 },
  dummyTarget: NONE,
};

/** The row for `sprite`, else the default of `element`, else nothing. */
export function idleLookOf(sprite: string, element: string): IdleLook {
  const row = IDLE_LOOKS[sprite];
  if (row) return row;
  return (ELEMENT_IDLE_DEFAULTS as Readonly<Record<string, IdleLook | undefined>>)[element] ?? NONE;
}
