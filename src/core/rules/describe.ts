import type { AbilityDef } from '../data/types';
import type { AbilityDefB } from '../data/abilities-b';
import { levelMult } from './progression';

/** Legacy `defaults.type` strings as printed by GameHelper.getAbilityDescription. */
export type LegacyAbilityType = 'Range' | 'Range Omni-directional' | 'Melee' | 'Buff' | 'Heal';

export interface AbilityDescription {
  readonly type: LegacyAbilityType;
  readonly damage?: number;
  readonly heal?: number;
  readonly speed?: number;
  readonly maxActive?: number;
  /** Buff speed delta; negative means "reduce opponent's speed". */
  readonly speedDelta?: number;
  readonly damageDecreasePct?: number;
  readonly durationMs?: number;
  readonly cooldownMs: number;
  /** Extra free text (legacy additionalDescription). */
  readonly additional?: string;
  /** Whole-string override (legacy Capture); replaces the generated text. */
  readonly fixed?: string;
}

/** Legacy additional-info text for set A abilities (set B carries it in its data). */
const ADDITIONAL_A: Readonly<Record<string, string>> = {
  'elemental-advantage-fire-cone': 'Only usable on water elementals',
  fireball: 'Project grows in width and increases amount of damage done over distance',
  'sonar-blast': 'Project grows in width but decreases amount of damage done over distance',
  tornado: 'Will stun the opponent',
};

/** Legacy Capture overrides getDescription with this fixed string (typo kept, see KNOWN-BUGS). */
const CAPTURE_TEXT = 'Caputures an opponent';

/** Legacy typed 'capture' and 'debuff' as Range projectiles. */
function legacyType(kind: AbilityDef['kind']): LegacyAbilityType {
  switch (kind) {
    case 'omni':
      return 'Range Omni-directional';
    case 'melee':
      return 'Melee';
    case 'buff':
      return 'Buff';
    case 'heal':
      return 'Heal';
    default:
      return 'Range';
  }
}

/** Structured description at `level`; mirrors GameHelper.getAbilityDescription field selection. */
export function describeAbility(def: AbilityDef | AbilityDefB, level: number): AbilityDescription {
  const extra = def as Partial<AbilityDefB>;
  const type = legacyType(def.kind);
  const mult = levelMult(level);
  const hasDamage = type === 'Range' || type === 'Melee' || type === 'Range Omni-directional';
  const additional = extra.description ?? ADDITIONAL_A[def.id as string];
  return {
    type,
    ...(def.kind === 'capture' && { fixed: CAPTURE_TEXT }),
    ...(hasDamage && def.damage !== undefined && { damage: Math.floor(def.damage * mult) }),
    ...(type === 'Heal' && def.heal !== undefined && { heal: Math.floor(def.heal * mult) }),
    ...(type === 'Range' && def.speed !== undefined && { speed: def.speed }),
    ...(type === 'Range' && { maxActive: def.maxActive }),
    ...(type === 'Buff' && extra.speedDelta !== undefined && { speedDelta: extra.speedDelta }),
    ...(type === 'Buff' &&
      extra.damageDecreasePercentage !== undefined && { damageDecreasePct: extra.damageDecreasePercentage }),
    ...(def.durationMs !== undefined && { durationMs: def.durationMs }),
    cooldownMs: def.cooldownMs,
    ...(additional !== undefined && { additional }),
  };
}

/** Render to the legacy HTML-ish string (line order and the "Addtional" typo kept verbatim). */
export function renderAbilityDescription(d: AbilityDescription): string {
  if (d.fixed !== undefined) return d.fixed;
  let s = `Type : ${d.type}<br/>`;
  if (d.damage !== undefined) s += `Damage : ${String(d.damage)}<br/>`;
  if (d.heal !== undefined) s += `Heal : ${String(d.heal)}<br/>`;
  if (d.speed !== undefined) s += `Projectile Speed : ${String(d.speed)}<br/>`;
  if (d.maxActive !== undefined) s += `Max projectiles active : ${String(d.maxActive)}<br/>`;
  if (d.speedDelta !== undefined) {
    s +=
      d.speedDelta < 0
        ? `Reduce Opponent's speed : ${String(-d.speedDelta)}<br/>`
        : `Speed Increase : ${String(d.speedDelta)}<br/>`;
  }
  if (d.damageDecreasePct !== undefined) s += `Damage Taken Reduced By : ${String(d.damageDecreasePct)}%<br/>`;
  if (d.durationMs !== undefined) s += `Duration : ${String(d.durationMs)}ms <br/>`;
  s += `Cooldown : ${String(d.cooldownMs)}ms <br/>`;
  if (d.additional !== undefined) s += `Addtional info : ${d.additional}<br/>`;
  return s;
}
