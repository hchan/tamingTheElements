import type Phaser from 'phaser';
import { EntityFlag, SimEventKind, type RenderCharacter, type RenderArcade, type RenderProjectile, type RenderView, type SimEvent } from '@core/index';
import { poseHoldMs } from '../fx/hit-feel';
import { smoothKindForDef } from '../fx/ability-smooth';
import { PoseVfx } from './pose-vfx';
import { tagEntryOf } from './tag-entry';
import { CAST_Z, PROJ_CAST_GAP_MS, PROJ_CAST_Z, shadowFor, type ShadowPose } from './pose-depth';
import { FX_ELEMENTS } from './pose-vfx-math';
import { createFrameResolver, generatedSheets, walkTime, type FrameResolver, type SheetFrame } from '../assets/sheet-frames';
import type { Action, SheetsManifest } from '../assets/sheet-spec';
declare global {
  interface Window {
    /** Dev and test builds: a sheets manifest that replaces the shipped one for the next match (e2e fixture). */
    __TTE_SHEETS__?: SheetsManifest;
  }
}
import { SheetBook } from './pose-sheets';
import { fitToBox } from './hero-scale';
import { idleLookOf } from '../platform/idle-look';
import { applyIdleMotif } from './idle-motif';
import { applyBackGait, applyLocomotion, backGaitOf, backingAway, facesToward, locomotionOf, walkFrameBack, walkTimeFor } from './locomotion';
import { gradedHeroTexture } from '../fx/hero-grade';
import { MAP_SPRITES, flipForDir, frameName, frameSetFor, framesOf, type CharacterView } from './character-view';
import type { ProjectileView } from './projectile-view';
import {
  POSE_MS, PoseKind, STAND_SPEED, STRIDE_PX, TELEPORT_PX, applyPose, breathe, follow, headingOf,
  leanFor, resetPose, walkFrame, type Pose,
} from './pose-math';
import { SLOTS, PoseClock, posePivot, type PoseState, type SheetDrawn } from './pose-layer-types';
import { GhostPool } from './pose-ghosts';
import { PoseProjectiles } from './pose-projectiles';
import { ShakeDecay } from './pose-shake';
import { abilityMotion, edgeSquash, type MotionInput } from './pose-motion';
import { PoseSlots } from './pose-slots';
import { PoseMelee } from './pose-melee';
import { PoseDepthState } from './pose-depth-state';
import { drawnCharacters } from './pose-probe';
export type { PoseState, SheetDrawn };

/**
 * The procedural pose layer (WP-arcade-pose-layer, FUN-DESIGN 2.16 step 1), a lazy chunk mounted by the Arena for every
 * match. It runs on the scene's `postupdate`, after the Arena has drawn the interpolated characters and projectiles
 * (`CharacterView` / `ProjectileView` stay the owner of position, size, flip, tint and alpha and reset them every
 * frame), and only adjusts what the pooled Images show: the walk frame (driven by the distance travelled on screen, so
 * the feet match the speed whatever the display refresh rate), a lean towards the heading and the aim, idle breathing,
 * and, in Arcade only, event poses (cast, hurt, guard, dash, KO, victory, tag-in) as scale, rotation, offset and alpha.
 * Projectiles get shortest-arc rotation easing, a short spawn ease-in and a fade-out ghost when they end. The camera
 * shake decays instead of stopping dead. View only: nothing here reads or writes sim state, one `postupdate` listener,
 * a fixed pool of ghost Images, no allocation per frame; everything goes with the Arena.
 */

const SUPER_CHARGE_MS = 700;
const CHARGE_MS = 220;
const DEAD_OR_BENCHED = EntityFlag.benched | EntityFlag.dead;
/** Sheet row for each transient `PoseKind`. */
const KIND_ACTION: readonly Action[] = ['idle', 'cast', 'hurt', 'dash', 'tagIn', 'victory'];
const GUARD_ROW_MS = 140;
/** Render-only extra pose hold when a lunge connects (ms), on top of the strength hold. */
const LUNGE_HOLD_MS = 25;
/** A second hit from the same Hurricane within this wall-ms gap is a repeat pulse (pulses come every 500 ms): no pose hold. */
const HURRICANE_REPEAT_MS = 1500;
/** Distance (px) between lunge afterimages. */
const AFTER_GAP_PX = 16;

export interface PoseLayerDeps {
  readonly scene: Phaser.Scene;
  readonly view: RenderView;
  readonly characters: { peek(id: number): Pick<CharacterView, 'image' | 'scale' | 'shadowPose'> | undefined };
  readonly projectiles: { peek(id: number): Pick<ProjectileView, 'image' | 'glow'> | undefined };
  readonly reduced: () => boolean;
  /** Sprite sheet lookup (default: the shipped manifest) and the URL base its atlases load from. */
  readonly sheets?: FrameResolver;
  readonly sheetBase?: string;
}

export class PoseLayer {
  /** Animation and VFX clocks and per-frame flags (read by the ghost pool and the projectile pass). */
  private readonly clk = new PoseClock();
  private victoryTeam = -1;
  private victoryAt = 0;
  private posed = 0;
  private readonly shadowOut: ShadowPose = { dx: 0, dy: 0, scaleMul: 1, alphaMul: 1 };
  private readonly vfx: PoseVfx;
  readonly book: SheetBook;
  private readonly pose: Pose = resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
  /** Per-character slot data (entity id masked into SLOTS). */
  private readonly s = new PoseSlots();
  private readonly eachChar = (c: RenderCharacter): void => { this.character(c); };
  private readonly eachX = (c: RenderCharacter): void => { this.s.simX[c.id & (SLOTS - 1)] = c.x; };
  private readonly eachProj = (p: RenderProjectile): void => { this.projectiles.update(p); };
  private readonly eachMelee = (p: RenderProjectile): void => { this.abil.update(p); };

  private readonly ghosts: GhostPool;
  private readonly projectiles: PoseProjectiles;
  private readonly shake = new ShakeDecay();
  private readonly depth = new PoseDepthState(this.clk);
  /** Melee boxes and the per-character ability smoothing state (lunge, settle, squeeze, last Hurricane hit). */
  private readonly abil = new PoseMelee(this.clk, {
    nearestCaster: (p) => this.nearestCaster(p),
    castFrom: (best, p) => { this.castFrom(best, p); },
    dustAt: (j) => { this.dustAt(j); },
  });
  private readonly motion: MotionInput = { fxMs: 0, reduced: false, settleAt: 0, lunging: false, squeezeAt: 0, squeezeDir: 1 };

  constructor(private readonly deps: PoseLayerDeps) {
    this.vfx = new PoseVfx(deps.scene);
    this.book = new SheetBook(deps.scene, deps.sheets ?? createFrameResolver(generatedSheets), deps.sheetBase ?? '');
    this.ghosts = new GhostPool(deps.scene, this.clk, this.book);
    this.projectiles = new PoseProjectiles(this.clk, (id) => deps.projectiles.peek(id), this.vfx, this.ghosts, (p) => this.casterOf(p));
  }

  /** The rendered ghosts in use (test probe). */
  get state(): PoseState {
    return { animMs: this.clk.animMs, posed: this.posed, ghosts: this.ghosts.live, fx: this.vfx.live };
  }

  sheetProbe(): { loaded: string[]; characters: SheetDrawn[] } {
    return {
      loaded: this.book.loaded,
      characters: drawnCharacters(this.deps.view, this.deps.characters, this.s, this.depth),
    };
  }

  /** Feeds one tick's events (once each: the caller dedupes). */
  consume(events: readonly SimEvent[]): void {
    if (this.deps.view.arcade() === undefined) return;
    for (const e of events) {
      switch (e.kind) {
        case SimEventKind.hitConfirmed: {
          const t = (e['target'] ?? -1) & (SLOTS - 1);
          const a = (e['attacker'] ?? e.sourceId) & (SLOTS - 1);
          const kind = smoothKindForDef(e['ability'] ?? -1);
          // Hurricane pulses 2..: a repeat hit from the same hurricane keeps the sim running (no pose hold); a lunge holds a touch longer.
          const repeat = kind === 'spin' && this.clk.fxMs - (this.abil.hurriAt[a] ?? -1e9) < HURRICANE_REPEAT_MS;
          if (kind === 'spin') this.abil.hurriAt[a] = this.clk.fxMs;
          const base = repeat ? 0 : poseHoldMs(e['strength'] ?? 0, this.clk.reduced);
          this.clk.holdMs = Math.max(this.clk.holdMs, base + (kind === 'lunge' && !this.clk.reduced ? LUNGE_HOLD_MS : 0));
          if (kind === 'grab' && !this.clk.reduced) {
            this.abil.squeezeAt[t] = this.clk.fxMs;
            this.abil.squeezeDir[t] = (this.s.lx[a] ?? 0) >= (this.s.lx[t] ?? 0) ? 1 : -1;
          }
          this.start(t, PoseKind.hurt, (this.s.lx[t] ?? 0) >= (this.s.lx[a] ?? 0) ? 1 : -1, ((e['strength'] ?? 0) / 3));
          break;
        }
        case SimEventKind.dashed: {
          const d = e['dir'] ?? 0;
          this.start(e.sourceId & (SLOTS - 1), PoseKind.dash, d === 0 || d === 1 || d === 7 ? 1 : -1, 1);
          break;
        }
        case SimEventKind.tagIn:
          this.ghosts.clearKo(e['team'] ?? 0); this.deps.view.forEachCharacter(this.eachX);
          this.start((e['to'] ?? 0) & (SLOTS - 1), PoseKind.tagIn, ...tagEntryOf(e, SLOTS - 1, this.s.team, this.s.have, this.s.simX));
          break;
        case SimEventKind.superStarted: {
          const s = (e['caster'] ?? e.sourceId) & (SLOTS - 1);
          this.vfx.charge(s, SUPER_CHARGE_MS, true);
          this.depth.holdSuper(s);
          break;
        }
        case SimEventKind.elementalCast:
          this.depth.castPulse(e.sourceId & (SLOTS - 1), CAST_Z);
          break;
        case SimEventKind.chargeStarted:
          this.vfx.charge(e.sourceId & (SLOTS - 1), CHARGE_MS, false);
          this.depth.castPulse(e.sourceId & (SLOTS - 1), CAST_Z);
          break;
        case SimEventKind.died:
          this.depth.reset(e.sourceId & (SLOTS - 1));
          this.knockOut(e.sourceId, e['team'] ?? -1);
          break;
        case SimEventKind.roundEnded:
          this.victoryTeam = e['winner'] ?? -1;
          this.victoryAt = this.clk.animMs;
          break;
        case SimEventKind.roundStarted:
          this.victoryTeam = -1;
          for (let s = 0; s < SLOTS; s++) this.depth.reset(s);
          break;
        default:
      }
    }
  }

  /** One rendered frame at wall time `nowMs` that lasted `deltaMs`. */
  frame(nowMs: number, deltaMs: number): void {
    const { view } = this.deps;
    const ar = view.arcade();
    this.clk.arcade = ar !== undefined;
    this.clk.reduced = this.deps.reduced();
    this.clk.advance(nowMs, deltaMs, view.tick, ar?.frozen === true);
    if (this.clk.arcade) this.vfx.frame(this.clk.fxDt, this.clk.reduced);
    if (ar?.frozen !== true) this.depth.expireHolds();
    this.clk.frameNo++;
    this.posed = 0;
    // The foe may have a higher id than the hero: every sim x is read before any character is posed.
    if (this.clk.arcade) view.forEachCharacter(this.eachX);
    // Melee boxes first, so a cast pose starts on the frame the box appears; they are never visited by the projectile pass below.
    if (this.clk.arcade) {
      view.forEachProjectile(this.eachMelee, true);
      this.abil.endFrame();
    }
    view.forEachCharacter(this.eachChar);
    view.forEachProjectile(this.eachProj);
    this.projectiles.endFrame();
    this.ghosts.fade();
    this.shake.update(this.deps.scene);
  }

  private start(slot: number, kind: number, dir: number, power: number): void {
    this.s.kind[slot] = kind;
    this.s.kindAt[slot] = this.clk.animMs; this.s.kindFxAt[slot] = this.clk.fxMs;
    this.s.kindDir[slot] = dir; this.s.kindPower[slot] = power;
  }

  private character(c: RenderCharacter): void {
    const v = this.deps.characters.peek(c.id);
    const i = c.id & (SLOTS - 1);
    // Every character of the match (the bench too) gets its sheet loaded, if the manifest has one.
    this.book.want(c.sprite);
    if (!v || (c.flags & DEAD_OR_BENCHED) !== 0) {
      this.s.have[i] = 0;
      this.s.moving[i] = 0;
      this.s.back[i] = 0;
      this.depth.hide(i);
      return;
    }
    const img = v.image;
    // The visual box CharacterView just drew (feet-anchored); every frame shown is fitted to it, so a frame swap never pops size.
    const bx = img.x;
    const by = img.y;
    const bw = c.w * v.scale;
    const bh = c.h * v.scale;
    const o = i * 4;
    this.s.base[o] = bx;
    this.s.base[o + 1] = by;
    this.s.base[o + 2] = bw;
    this.s.base[o + 3] = bh;
    this.s.team[i] = c.team;
    this.s.elem[i] = Math.max(FX_ELEMENTS.indexOf(c.element), 0);
    // The drawn position without the hit-stop jitter (which only exists while the character is held still).
    const dx = c.x !== c.px ? img.x : c.x;
    const dy = c.y !== c.py ? img.y : c.y;
    if (this.clk.arcade) this.vfx.anchor(i, dx + c.w / 2, dy + c.h / 2, this.s.elem[i] ?? 0);
    let dist = 0;
    if (this.s.have[i] === 1) {
      dist = Math.hypot(dx - (this.s.lx[i] ?? dx), dy - (this.s.ly[i] ?? dy));
      if (dist > TELEPORT_PX) dist = 0;
    }
    const ddx = dx - (this.s.lx[i] ?? dx);
    const ddy = dy - (this.s.ly[i] ?? dy);
    this.s.have[i] = 1;
    this.s.lx[i] = dx;
    this.s.ly[i] = dy;
    const dt = this.clk.dt;
    const walking = dt > 0 && (dist * 1000) / dt > STAND_SPEED;
    const wasWalking = this.s.moving[i] === 1;
    this.s.moving[i] = walking ? 1 : 0;
    if (walking !== wasWalking) {
      this.s.edge[i] = walking ? 1 : 2;
      this.s.edgeAt[i] = this.clk.animMs;
    }
    const m = (this.s.move[i] ?? 0) + ((walking ? 1 : 0) - (this.s.move[i] ?? 0)) * follow(dt, walking ? 60 : 140);
    this.s.move[i] = m;
    this.s.phase[i] = !walking && m < 0.05 ? 0 : (this.s.phase[i] ?? 0) + dist;
    const ar = this.deps.view.arcade();
    const face = ar ? ar.aim(c.id) : c.dir;
    this.s.face[i] = face;
    this.s.spriteOf[i] = c.sprite;
    const backing = ar !== undefined && this.backingNow(c, i, ar, face);
    const b = (this.s.back[i] ?? 0) + ((backing ? 1 : 0) - (this.s.back[i] ?? 0)) * follow(dt, 80);
    this.s.back[i] = b;
    const gait = backGaitOf(c.sprite);

    // A sheet row when the character has one (its own art carries the walk, idle and lean), else the legacy art: the walk
    // cycle by distance walked (all views), the facing, and the procedural lean and bob for 8-way movement and aim.
    this.s.bakedBack[i] = 0;
    const sheet = this.book.has(c.sprite) ? this.sheetFrame(c, i, face, walking || m > 0.05) : undefined;
    const sprite = MAP_SPRITES[c.sprite];
    if (sheet) {
      const shown = this.book.texture(c.sprite, sheet.texture);
      if (img.texture.key === shown) img.setFrame(sheet.frame);
      else img.setTexture(shown, sheet.frame);
      // N and S of a big-frame sheet are side views (baked from NE / SE): keep the last horizontal facing.
      const vertical = face === 2 || face === 6;
      const flip = vertical && sheet.box.w !== sheet.rect.w ? this.s.hflip[i] === 1 : sheet.flipX;
      if (!vertical) this.s.hflip[i] = flipForDir(face) ? 1 : 0;
      img.setFlipX(flip);
      this.s.lean[i] = 0;
    } else {
      if (sprite) {
        const set = frameSetFor(face);
        const count = framesOf(sprite, set).length;
        const name = frameName(set, m > 0.05 || walking ? (b > 0.5 && gait.reverse ? walkFrameBack(this.s.phase[i] ?? 0, count, gait.stridePx) : walkFrame(this.s.phase[i] ?? 0, count)) : 0);
        if (img.texture.key.startsWith('sheet:')) img.setTexture(gradedHeroTexture(this.deps.scene, `map:${c.sprite}`), name);
        else img.setFrame(name);
      }
      img.setFlipX(flipForDir(face));
      if (face !== 2 && face !== 6) this.s.hflip[i] = flipForDir(face) ? 1 : 0;
    }
    fitToBox(img, bx, by, bw, bh);

    const p = resetPose(this.pose);
    let lungeTrail = false;
    if (!this.clk.reduced && !sheet) {
      const heading = walking ? headingOf(ddx, ddy) : -1;
      const target = (heading >= 0 ? leanFor(heading) * m * (1 - b) : 0) + (walking || (face & 1) === 0 ? 0 : leanFor(face) * 0.4);
      this.s.lean[i] = (this.s.lean[i] ?? 0) + (target - (this.s.lean[i] ?? 0)) * follow(dt, 90);
      p.rot = this.s.lean[i] ?? 0;
      breathe(p, this.clk.animMs + i * 370, 1 - m);
      p.oy -= 1.5 * Math.abs(Math.sin(((this.s.phase[i] ?? 0) / STRIDE_PX) * Math.PI)) * m;
    }
    // Wings flap and knees bend while moving (per-hero flags, views/locomotion.ts); nothing under reduced motion.
    // While backing away the forward cues fade out and the hero's back gait fades in (no double flap or knee dip).
    applyLocomotion(p, locomotionOf(c.sprite), m * (1 - b), this.s.phase[i] ?? 0, this.clk.animMs + i * 131, this.clk.reduced);
    // Idle body motif (idle-element-auras): a small per-hero move while standing, sheet heroes included; boxed rigs keep rot/oy/alpha.
    const boxedRig = sheet !== undefined && sheet.box.w !== sheet.rect.w;
    const look = idleLookOf(c.sprite, c.element);
    const r0 = p.rot;
    const o0 = p.oy;
    const a0 = p.alpha;
    applyIdleMotif(p, look.motif, this.clk.animMs + i * 211, (1 - m) * (1 - b), this.clk.reduced, boxedRig, look.amount);
    this.s.mRot[i] = p.rot - r0;
    this.s.mOy[i] = p.oy - o0;
    this.s.mAlpha[i] = a0 === 0 ? 1 : p.alpha / a0;
    applyBackGait(p, gait, this.s.bakedBack[i] === 1 ? 0 : m * b, this.s.backSide[i] ?? 1, this.s.phase[i] ?? 0, this.clk.animMs + i * 131, this.clk.reduced);
    if (!this.clk.reduced) {
      const e = this.s.edge[i] ?? 0;
      if (e !== 0 && !edgeSquash(p, e, this.clk.animMs - (this.s.edgeAt[i] ?? 0))) this.s.edge[i] = 0;
    }
    if (ar) {
      const g = (this.s.guard[i] ?? 0) + ((ar.guarding(c.id) ? 1 : 0) - (this.s.guard[i] ?? 0)) * follow(dt, 70);
      this.s.guard[i] = g;
      if (!this.clk.reduced) {
        p.sy *= 1 - 0.1 * g;
        p.sx *= 1 + 0.04 * g;
      }
      const k = this.s.kind[i] ?? 0;
      if (k !== 0) {
        if (this.clk.animMs - (this.s.kindAt[i] ?? 0) >= (POSE_MS[k] ?? 0)) this.s.kind[i] = 0;
        else applyPose(p, k, this.clk.animMs - (this.s.kindAt[i] ?? 0), this.s.kindDir[i] ?? 1, this.s.kindPower[i] ?? 0, this.clk.reduced, this.clk.fxMs - (this.s.kindFxAt[i] ?? 0));
      }
      if (this.victoryTeam === c.team) applyPose(p, PoseKind.victory, this.clk.animMs - this.victoryAt, 1, 0, this.clk.reduced);
      const m = this.motion;
      m.fxMs = this.clk.fxMs;
      m.reduced = this.clk.reduced;
      m.settleAt = this.abil.settleAt[i] ?? -1e9;
      m.lunging = this.abil.lungeOn[i] === 1;
      m.squeezeAt = this.abil.squeezeAt[i] ?? -1e9;
      m.squeezeDir = this.abil.squeezeDir[i] ?? 1;
      lungeTrail = abilityMotion(p, m, ddx, ddy, dist, dt);
    }
    // Portrait rigs (boxed frames, ADR-0020) bake their own weighty motion: no runtime squash and stretch on top (owner: no
    // bouncy squash; it also made the painted body jump ~5% in height). Lean, offsets and fades still apply.
    if (sheet && sheet.box.w !== sheet.rect.w) {
      p.sx = 1;
      p.sy = 1;
    }
    // Depth step (Arcade): a super or cast steps the hero toward the camera, last before place() so it sits on every other pose.
    if (this.clk.arcade) this.depth.step(i, p, bh, boxedRig);
    this.place(img, bx + bw / 2, by + bh, p);
    if (this.clk.arcade && this.abil.lungeOn[i] === 1 && !this.clk.reduced) {
      this.abil.lungeAcc[i] = (this.abil.lungeAcc[i] ?? 0) + dist;
      if ((this.abil.lungeAcc[i] ?? 0) >= AFTER_GAP_PX && lungeTrail) {
        this.abil.lungeAcc[i] = 0;
        this.vfx.afterimage(img, this.s.elem[i] ?? 0, this.clk.reduced);
      }
    }
    if (this.clk.arcade && (this.depth.z[i] ?? 0) > 0.001) {
      const o2 = shadowFor(this.depth.z[i] ?? 0, bh, this.shadowOut);
      v.shadowPose(o2.dx, o2.dy, o2.scaleMul, o2.alphaMul);
    }
  }

  /** The sheet frame to show: a running event pose, the victory, guard, walk (by distance walked) or idle row. */
  private sheetFrame(c: RenderCharacter, i: number, face: number, walking: boolean): SheetFrame | undefined {
    const k = this.s.kind[i] ?? 0;
    const age = this.clk.animMs - (this.s.kindAt[i] ?? 0);
    const g = this.s.guard[i] ?? 0;
    if (k !== 0 && age < (POSE_MS[k] ?? 0)) return this.book.frame(c.sprite, KIND_ACTION[k] ?? 'idle', face, age);
    if (this.victoryTeam === c.team) return this.book.frame(c.sprite, 'victory', face, this.clk.animMs - this.victoryAt);
    if (g > 0.05) return this.book.frame(c.sprite, 'guard', face, g * GUARD_ROW_MS);
    if (walking) {
      const bk = (this.s.back[i] ?? 0) > 0.5;
      const baked = bk ? this.book.frame(c.sprite, 'walkBack', face, walkTime(this.s.phase[i] ?? 0, backGaitOf(c.sprite).stridePx)) : undefined;
      this.s.bakedBack[i] = baked ? 1 : 0;
      return baked ?? this.book.frame(c.sprite, 'walk', face, walkTimeFor(c.sprite, this.s.phase[i] ?? 0, bk));
    }
    return this.book.frame(c.sprite, 'idle', face, this.clk.animMs + i * 370);
  }

  /**
   * True while `c` is really stepping away from its foe (mirrors the sim's backwardWalkX from the actual step, so an inertia
   * turn shows the forward walk until the velocity reverses) and nothing else owns its body: no foe, stun, guard, root, a live
   * event pose, victory, or a facing that is not toward the foe (a held diagonal is the player's override).
   */
  private backingNow(c: RenderCharacter, i: number, ar: RenderArcade, face: number): boolean {
    const foe = ar.active(1 - c.team);
    if (foe < 0 || foe === c.id) return false;
    const foeX = this.s.simX[foe & (SLOTS - 1)] ?? c.x;
    if (!backingAway(c.x, c.px, foeX) || !facesToward(face, c.px, foeX)) return false;
    if (ar.stunned(c.id) || ar.guarding(c.id) || ar.rooted(c.id) || this.victoryTeam === c.team) return false;
    const k = this.s.kind[i] ?? 0;
    if (k !== 0 && this.clk.animMs - (this.s.kindAt[i] ?? 0) < (POSE_MS[k] ?? 0)) return false;
    this.s.backSide[i] = foeX > c.px ? 1 : -1;
    return true;
  }

  /** Applies `p` about the feet point (fx, fy) of the visual box the image was just fitted to. */
  private place(img: Phaser.GameObjects.Image, fx: number, fy: number, p: Pose): void {
    const still = Math.abs(p.sx - 1) + Math.abs(p.sy - 1) + Math.abs(p.rot) + Math.abs(p.ox) + Math.abs(p.oy) + Math.abs(1 - p.alpha);
    if (still < 1e-4) {
      if (img.rotation !== 0) img.setRotation(0);
      return;
    }
    this.posed++;
    posePivot(img, fx, fy, p);
  }

  /** The slot of the nearest same-team character to `p` (-1: none seen yet). */
  private nearestCaster(p: RenderProjectile): number {
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < SLOTS; j++) {
      if (this.s.have[j] !== 1 || this.s.team[j] !== p.team) continue;
      const d = Math.abs((this.s.lx[j] ?? 0) - p.x) + Math.abs((this.s.ly[j] ?? 0) - p.y);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    return best;
  }

  /** The cast pose, depth pulse and release flare for the caster `best` of `p`. */
  private castFrom(best: number, p: RenderProjectile): void {
    if (this.clk.fxMs - (this.depth.castAt[best] ?? -1e9) >= PROJ_CAST_GAP_MS) this.depth.castPulse(best, PROJ_CAST_Z);
    this.start(best, PoseKind.cast, p.dir === 0 || p.dir === 1 || p.dir === 7 ? 1 : -1, 1);
    this.vfx.release(best);
  }

  /** A projectile first seen: the nearest same-team character just cast it. Returns that caster's element index (-1: none seen yet). */
  private casterOf(p: RenderProjectile): number {
    const best = this.nearestCaster(p);
    if (best < 0) return -1;
    this.castFrom(best, p);
    return this.s.elem[best] ?? 0;
  }

  /** A dust puff at the feet of character slot `j` (the box centre bottom CharacterView drew last). */
  private dustAt(j: number): void {
    const o = j * 4;
    this.vfx.dust((this.s.base[o] ?? 0) + (this.s.base[o + 2] ?? 0) / 2, (this.s.base[o + 1] ?? 0) + (this.s.base[o + 3] ?? 0), this.s.elem[j] ?? 0, this.clk.reduced);
  }

  /** The KO fall of character `id`: a ghost copy of its last drawn image falls over and fades while the real one is hidden. */
  private knockOut(id: number, team: number): void {
    const v = this.deps.characters.peek(id);
    if (!v) return;
    const slot = id & (SLOTS - 1);
    this.ghosts.knockOut(v.image, team, this.s.base, id, this.s.spriteOf[slot] ?? '', this.s.face[slot] ?? 0);
  }

  destroy(): void {
    this.ghosts.destroy();
    this.vfx.destroy();
  }
}
const layers = new WeakMap<Phaser.Scene, PoseLayer>();

/** Test probe: the sheets loaded and, per drawn character, the texture, frame, mirror and rotation shown (undefined before the mount). */
export function sheetState(scene: Phaser.Scene): { loaded: string[]; characters: SheetDrawn[] } | undefined {
  const layer = layers.get(scene);
  return layer?.sheetProbe();
}

/** Mounts the layer in the Arena `scene`; returns the event consumer the Arena feeds each tick. Torn down with the scene. */
export function mountPoseLayer(
  scene: Phaser.Scene,
  view: RenderView,
  characters: PoseLayerDeps['characters'],
  projectiles: PoseLayerDeps['projectiles'],
  prefs: () => { readonly reduceMotion: boolean },
): (events: readonly SimEvent[]) => void {
  // Dev and test builds only: an e2e may hand in its own sheets manifest (a fixture atlas served by the test, never shipped).
  const fixture = import.meta.env.DEV || import.meta.env.MODE === 'test' ? window.__TTE_SHEETS__ : undefined;
  const sheets = fixture === undefined ? undefined : createFrameResolver(fixture);
  const layer = new PoseLayer({
    scene, view, characters, projectiles, reduced: () => prefs().reduceMotion, sheetBase: import.meta.env.BASE_URL, ...(sheets && { sheets }),
  });
  layers.set(scene, layer);
  const onFrame = (time: number, delta: number): void => { layer.frame(time, delta); };
  const off = (): void => {
    scene.events.off('postupdate', onFrame).off('shutdown', off).off('destroy', off);
    layers.delete(scene);
    layer.destroy();
  };
  scene.events.on('postupdate', onFrame);
  scene.events.once('shutdown', off).once('destroy', off);
  return (events) => { layer.consume(events); };
}