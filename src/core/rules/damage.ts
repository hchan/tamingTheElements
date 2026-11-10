import { elementRelation, type Element } from '../data/elements';

/** Legacy sentinel (Number.MAX_VALUE): damage that bypasses every modifier (capture, cheats). */
export const CAPTURE_DAMAGE = Number.MAX_VALUE;

/** Legacy Global.elementalDamageMultiplier / elementalDamageReductionMultiplier. */
export const ELEMENTAL_DAMAGE_MULT = 1.25;
export const ELEMENTAL_REDUCTION_MULT = 1.25;

export interface DamageInput {
  base: number;
  /** Legacy quirk kept: the multiplier is the ATTACKER's (the defender's targetPlayer). */
  attackerMult: number;
  attEl: Element;
  defEl: Element;
  defReductionPct: number;
}

/**
 * Port of legacy BaseCharacter.applyDamage's arithmetic. Operation order matters for
 * bit-exact parity: *mult, *1.25 (attacker advantage), /1.25 (attacker disadvantage),
 * -x*pct/100, clamp at 0.
 */
export function computeDamage(i: DamageInput): number {
  let damage = i.base;
  if (damage !== CAPTURE_DAMAGE) {
    damage *= i.attackerMult;
    const rel = elementRelation(i.attEl, i.defEl);
    if (rel === 'adv') damage *= ELEMENTAL_DAMAGE_MULT;
    if (rel === 'dis') damage /= ELEMENTAL_REDUCTION_MULT;
    damage -= (damage * i.defReductionPct) / 100;
  }
  return damage < 0 ? 0 : damage;
}

/** Health actually removed (legacy return value): capped at the pre-hit health. */
export function damageDealt(curHealth: number, damage: number): number {
  return Math.min(curHealth, damage);
}

/** Port of legacy BaseCharacter.heal: returns the new health, capped at maxHealth. */
export function computeHeal(curHealth: number, amount: number, healMult: number, maxHealth: number): number {
  const next = curHealth + amount * healMult;
  return next > maxHealth ? maxHealth : next;
}
