import { EntityFlag, EntityKind, MAX_ENTITIES, type SimState } from '../state';
import type { SimWorld } from '../world';
import { now } from '../clock';

export const REST_HEAL_INTERVAL = 50;
export const REST_HEAL_FRACTION = 0.005;

/**
 * Starts a character's rest timer (legacy `benchHelper` creates a `HealWithRest` with `delay(fn, 1000, -1)`, which
 * Crafty repeats forever). The timer lives in the character's `expireTick` (0 = no timer). Legacy creates a new timer
 * on every bench and keeps the old ones; one timer per character is kept here (KNOWN-BUGS `rest-heal-stacking`).
 */
export function startRestTimer(s: SimState, id: number, tick: number): void {
  s.expireTick[id] = tick + REST_HEAL_INTERVAL;
}

/**
 * Legacy `HealWithRest`: every 50 ticks from the bench, a living character that counts as benched heals 0.5% of
 * maxHp; once that takes it above restCap it is clamped to restCap and the timer stops. Legacy `Swap.isBenched` is
 * `player != character`, so every enemy counts as benched and an enemy back in play keeps healing toward its cap
 * (KNOWN-BUG:rest-heal-enemy-in-play, replicated).
 */
export function restSystem(world: SimWorld): void {
  const s = world.state;
  const tick = now(s);
  for (let id = 0; id < MAX_ENTITIES; id++) {
    const f = s.flags[id] ?? 0;
    const due = s.expireTick[id] ?? 0;
    if (s.kind[id] !== EntityKind.character || (f & EntityFlag.alive) === 0 || due === 0 || tick < due) continue;
    s.expireTick[id] = tick + REST_HEAL_INTERVAL;
    const benched = (f & EntityFlag.benched) !== 0 || s.team[id] === 1;
    if ((f & EntityFlag.dead) !== 0 || !benched) continue;
    const next = (s.hp[id] ?? 0) + (s.maxHp[id] ?? 0) * REST_HEAL_FRACTION;
    const cap = s.restCap[id] ?? 0;
    if (next > cap) {
      s.hp[id] = cap;
      s.expireTick[id] = 0;
    } else {
      s.hp[id] = next;
    }
  }
}
