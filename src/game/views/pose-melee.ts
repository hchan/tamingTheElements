import type { RenderProjectile } from '@core/index';
import { SMOOTH_KIND, type SmoothKind } from '../fx/ability-smooth';
import { SLOTS, type PoseClock } from './pose-layer-types';

/** What melee tracking needs from the layer: the caster search, the cast cue and the dust puff at a character's feet. */
export interface MeleeHost {
  nearestCaster(p: RenderProjectile): number;
  castFrom(best: number, p: RenderProjectile): void;
  dustAt(slot: number): void;
}

/**
 * Melee boxes (Arcade): a box's first sight is the only cue the renderer gets that the ability was cast. Ids are masked like
 * projectiles, in their own arrays so a melee box never takes a projectile's retire path. Also owns the per-character ability
 * smoothing state (lunge in progress and afterimage carry, settle and squeeze starts on the VFX clock, last Hurricane hit),
 * which the layer reads and writes.
 */
export class PoseMelee {
  private readonly meleeId = new Int32Array(SLOTS).fill(-1);
  private readonly meleeSeen = new Int32Array(SLOTS);
  /** Caster slot of the melee box (-1: none found) and its smooth kind (undefined: no smoothing entry). */
  private readonly meleeCaster = new Int8Array(SLOTS).fill(-1);
  private readonly meleeKind: (SmoothKind | undefined)[] = new Array<SmoothKind | undefined>(SLOTS).fill(undefined);
  readonly lungeOn = new Uint8Array(SLOTS);
  readonly lungeAcc = new Float64Array(SLOTS);
  readonly settleAt = new Float64Array(SLOTS).fill(-1e9);
  readonly squeezeAt = new Float64Array(SLOTS).fill(-1e9);
  readonly squeezeDir = new Int8Array(SLOTS).fill(1);
  readonly hurriAt = new Float64Array(SLOTS).fill(-1e9);

  constructor(private readonly clk: PoseClock, private readonly host: MeleeHost) {}

  /** Ends every melee box that was not seen this frame. */
  endFrame(): void {
    for (let i = 0; i < SLOTS; i++) {
      if (this.meleeId[i] !== -1 && this.meleeSeen[i] !== this.clk.frameNo) this.end(i);
    }
  }

  update(p: RenderProjectile): void {
    const i = p.id & (SLOTS - 1);
    if (this.meleeId[i] !== p.id) {
      if (this.meleeId[i] !== -1) this.end(i); // the slot's previous box ended and its id was reused in one frame
      this.meleeId[i] = p.id;
      const kind = SMOOTH_KIND[p.sprite];
      this.meleeKind[i] = kind;
      const best = this.host.nearestCaster(p);
      this.meleeCaster[i] = best;
      if (best >= 0) {
        this.host.castFrom(best, p);
        if (kind === 'lunge') {
          this.lungeOn[best] = 1;
          this.lungeAcc[best] = 0;
          this.host.dustAt(best);
        } else if (kind !== undefined) this.settleAt[best] = this.clk.fxMs;
      }
    }
    this.meleeSeen[i] = this.clk.frameNo;
  }

  /** A melee box that is no longer live: ends a lunge (dust puff, settle). Never an impact burst or a ghost: it is not a projectile. */
  private end(i: number): void {
    const best = this.meleeCaster[i] ?? -1;
    this.meleeId[i] = -1;
    this.meleeCaster[i] = -1;
    if (best >= 0 && this.meleeKind[i] === 'lunge' && this.lungeOn[best] === 1) {
      this.lungeOn[best] = 0;
      this.settleAt[best] = this.clk.fxMs;
      this.host.dustAt(best);
    }
    this.meleeKind[i] = undefined;
  }
}
