import type Phaser from 'phaser';
import { EntityFlag, SimEventKind, type RenderCharacter, type RenderProjectile, type RenderView, type SimEvent } from '@core/index';
import { PoseVfx } from './pose-vfx';
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
import { MAP_SPRITES, flipForDir, frameName, frameSetFor, framesOf, type CharacterView } from './character-view';
import type { ProjectileView } from './projectile-view';
import {
  MAX_DT_MS, POSE_MS, PoseKind, STAND_SPEED, STRIDE_PX, TELEPORT_PX, applyPose, breathe, easeOutCubic, follow, headingOf, koFall,
  leanFor, resetPose, shortestArc, walkFrame, type Pose,
} from './pose-math';

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

const SLOTS = 64;
const DEG = Math.PI / 180;
const STALL_MS = 80;
const SPAWN_MS = 60;
const SPAWN_FROM = 0.6;
const FADE_MS = 130;
const FADE_GROW = 0.35;
const ROT_TAU_MS = 45;
const KO_MS = 700;
const GHOSTS = 8;
const START_MS = 100;
const SUPER_CHARGE_MS = 700;
const CHARGE_MS = 220;
const STOP_MS = 170;
const DEAD_OR_BENCHED = EntityFlag.benched | EntityFlag.dead;
/** Sheet row for each transient `PoseKind`. */
const KIND_ACTION: readonly Action[] = ['idle', 'cast', 'hurt', 'dash', 'tagIn', 'victory'];
const GUARD_ROW_MS = 140;

/** Read-out for the test probe. */
export interface PoseState {
  readonly animMs: number;
  /** Characters with a pose or locomotion effect applied on the last frame, ghosts fading, and shortest-arc rotation steps taken. */
  readonly posed: number;
  readonly ghosts: number;
  /** Ability VFX motes and glows showing. */
  readonly fx: number;
}

interface Ghost {
  readonly image: Phaser.GameObjects.Image;
  /** Start of the fade on the animation clock; negative infinity while free. */
  from: number;
  ms: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  /** 0 projectile fade (centre origin), 1 KO fall (feet pivot, top-left origin). */
  kind: number;
  dir: number;
  /** KO fall: the sprite and facing, to play its sheet's `ko` row when it has one. */
  sprite: string;
  face: number;
}

export interface PoseLayerDeps {
  readonly scene: Phaser.Scene;
  readonly view: RenderView;
  readonly characters: { peek(id: number): Pick<CharacterView, 'image' | 'scale'> | undefined };
  readonly projectiles: { peek(id: number): Pick<ProjectileView, 'image' | 'glow'> | undefined };
  readonly reduced: () => boolean;
  /** Sprite sheet lookup (default: the shipped manifest) and the URL base its atlases load from. */
  readonly sheets?: FrameResolver;
  readonly sheetBase?: string;
}

export class PoseLayer {
  /** The animation clock in ms: advances only while the sim runs (not paused, not in a hit-stop). */
  private animMs = 0;
  private dt = 0;
  private frameNo = 0;
  private lastTick = -1;
  private lastTickAt = 0;
  private reduced = false;
  private arcade = false;
  private shaking = false;
  private shakeX = 0;
  private shakeY = 0;
  private victoryTeam = -1;
  private victoryAt = 0;
  private posed = 0;
  private readonly vfx: PoseVfx;
  readonly book: SheetBook;
  private readonly pose: Pose = resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
  // Per character slot (entity id).
  private readonly have = new Uint8Array(SLOTS);
  private readonly moving = new Uint8Array(SLOTS);
  private readonly team = new Int8Array(SLOTS).fill(-1);
  private readonly elem = new Uint8Array(SLOTS);
  private readonly lx = new Float64Array(SLOTS);
  private readonly ly = new Float64Array(SLOTS);
  private readonly phase = new Float64Array(SLOTS);
  private readonly move = new Float64Array(SLOTS);
  private readonly lean = new Float64Array(SLOTS);
  private readonly guard = new Float64Array(SLOTS);
  private readonly kind = new Uint8Array(SLOTS);
  private readonly kindAt = new Float64Array(SLOTS);
  private readonly kindDir = new Float64Array(SLOTS);
  private readonly kindPower = new Float64Array(SLOTS);
  private readonly edge = new Uint8Array(SLOTS);
  private readonly edgeAt = new Float64Array(SLOTS);
  private readonly face = new Uint8Array(SLOTS);
  private readonly spriteOf: string[] = new Array<string>(SLOTS).fill('');
  // Per projectile slot.
  private readonly pid = new Int32Array(SLOTS).fill(-1);
  private readonly born = new Float64Array(SLOTS);
  private readonly ang = new Float64Array(SLOTS);
  private readonly seen = new Int32Array(SLOTS);
  private readonly pel = new Uint8Array(SLOTS);
  private readonly snap = new Float64Array(SLOTS * 5);
  private readonly snapKey: string[] = new Array<string>(SLOTS).fill('');
  private readonly snapFrame: string[] = new Array<string>(SLOTS).fill('');
  private readonly ghosts: Ghost[] = [];
  private readonly eachChar = (c: RenderCharacter): void => { this.character(c); };
  private readonly eachProj = (p: RenderProjectile): void => { this.projectile(p); };

  constructor(private readonly deps: PoseLayerDeps) {
    this.vfx = new PoseVfx(deps.scene);
    this.book = new SheetBook(deps.scene, deps.sheets ?? createFrameResolver(generatedSheets), deps.sheetBase ?? '');
  }

  /** The rendered ghosts in use (test probe). */
  get state(): PoseState {
    let ghosts = 0;
    for (const g of this.ghosts) if (g.from > Number.NEGATIVE_INFINITY) ghosts++;
    return { animMs: this.animMs, posed: this.posed, ghosts, fx: this.vfx.live };
  }

  sheetProbe(): { loaded: string[]; characters: { id: number; texture: string; frame: string; flipX: boolean; rotation: number }[] } {
    const characters: { id: number; texture: string; frame: string; flipX: boolean; rotation: number }[] = [];
    this.deps.view.forEachCharacter((c) => {
      const img = this.deps.characters.peek(c.id)?.image;
      if (img && (c.flags & DEAD_OR_BENCHED) === 0) {
        characters.push({ id: c.id, texture: img.texture.key, frame: img.frame.name, flipX: img.flipX, rotation: img.rotation });
      }
    });
    return { loaded: this.book.loaded, characters };
  }

  /** Feeds one tick's events (once each: the caller dedupes). */
  consume(events: readonly SimEvent[]): void {
    if (this.deps.view.arcade() === undefined) return;
    for (const e of events) {
      switch (e.kind) {
        case SimEventKind.hitConfirmed: {
          const t = (e['target'] ?? -1) & (SLOTS - 1);
          const a = (e['attacker'] ?? e.sourceId) & (SLOTS - 1);
          this.start(t, PoseKind.hurt, (this.lx[t] ?? 0) >= (this.lx[a] ?? 0) ? 1 : -1, ((e['strength'] ?? 0) / 3));
          break;
        }
        case SimEventKind.dashed: {
          const d = e['dir'] ?? 0;
          this.start(e.sourceId & (SLOTS - 1), PoseKind.dash, d === 0 || d === 1 || d === 7 ? 1 : -1, 1);
          break;
        }
        case SimEventKind.tagIn:
          this.start((e['to'] ?? 0) & (SLOTS - 1), PoseKind.tagIn, (e['team'] ?? 0) === 0 ? 1 : -1, 1);
          break;
        case SimEventKind.superStarted:
          this.vfx.charge((e['caster'] ?? e.sourceId) & (SLOTS - 1), SUPER_CHARGE_MS, true);
          break;
        case SimEventKind.chargeStarted:
          this.vfx.charge(e.sourceId & (SLOTS - 1), CHARGE_MS, false);
          break;
        case SimEventKind.died:
          this.knockOut(e.sourceId);
          break;
        case SimEventKind.roundEnded:
          this.victoryTeam = e['winner'] ?? -1;
          this.victoryAt = this.animMs;
          break;
        case SimEventKind.roundStarted:
          this.victoryTeam = -1;
          break;
        default:
      }
    }
  }

  /** One rendered frame at wall time `nowMs` that lasted `deltaMs`. */
  frame(nowMs: number, deltaMs: number): void {
    const { view } = this.deps;
    const ar = view.arcade();
    this.arcade = ar !== undefined;
    this.reduced = this.deps.reduced();
    // The sim has stopped when its tick has not changed for a few ticks (pause, overlay) or a hit-stop holds it.
    if (view.tick !== this.lastTick) {
      this.lastTick = view.tick;
      this.lastTickAt = nowMs;
    }
    const stalled = nowMs - this.lastTickAt > STALL_MS || ar?.frozen === true;
    this.dt = stalled ? 0 : Math.min(Math.max(deltaMs, 0), MAX_DT_MS);
    this.animMs += this.dt;
    // The VFX clock keeps running through a hit-stop freeze (a super's charge happens inside it) and stops only on a real pause.
    if (this.arcade) this.vfx.frame(nowMs - this.lastTickAt > STALL_MS && ar?.frozen !== true ? 0 : Math.min(Math.max(deltaMs, 0), MAX_DT_MS), this.reduced);
    this.frameNo++;
    this.posed = 0;
    view.forEachCharacter(this.eachChar);
    view.forEachProjectile(this.eachProj);
    for (let i = 0; i < SLOTS; i++) {
      if (this.pid[i] !== -1 && this.seen[i] !== this.frameNo) this.retire(i);
    }
    this.fadeGhosts();
    this.decayShake();
  }

  private start(slot: number, kind: number, dir: number, power: number): void {
    this.kind[slot] = kind;
    this.kindAt[slot] = this.animMs;
    this.kindDir[slot] = dir;
    this.kindPower[slot] = power;
  }

  private character(c: RenderCharacter): void {
    const v = this.deps.characters.peek(c.id);
    const i = c.id & (SLOTS - 1);
    // Every character of the match (the bench too) gets its sheet loaded, if the manifest has one.
    this.book.want(c.sprite);
    if (!v || (c.flags & DEAD_OR_BENCHED) !== 0) {
      this.have[i] = 0;
      this.moving[i] = 0;
      return;
    }
    const img = v.image;
    this.team[i] = c.team;
    this.elem[i] = Math.max(FX_ELEMENTS.indexOf(c.element), 0);
    // The drawn position without the hit-stop jitter (which only exists while the character is held still).
    const dx = c.x !== c.px ? img.x : c.x;
    const dy = c.y !== c.py ? img.y : c.y;
    if (this.arcade) this.vfx.anchor(i, dx + c.w / 2, dy + c.h / 2, this.elem[i] ?? 0);
    let dist = 0;
    if (this.have[i] === 1) {
      dist = Math.hypot(dx - (this.lx[i] ?? dx), dy - (this.ly[i] ?? dy));
      if (dist > TELEPORT_PX) dist = 0;
    }
    const ddx = dx - (this.lx[i] ?? dx);
    const ddy = dy - (this.ly[i] ?? dy);
    this.have[i] = 1;
    this.lx[i] = dx;
    this.ly[i] = dy;
    const dt = this.dt;
    const walking = dt > 0 && (dist * 1000) / dt > STAND_SPEED;
    const wasWalking = this.moving[i] === 1;
    this.moving[i] = walking ? 1 : 0;
    if (walking !== wasWalking) {
      this.edge[i] = walking ? 1 : 2;
      this.edgeAt[i] = this.animMs;
    }
    const m = (this.move[i] ?? 0) + ((walking ? 1 : 0) - (this.move[i] ?? 0)) * follow(dt, walking ? 60 : 140);
    this.move[i] = m;
    this.phase[i] = !walking && m < 0.05 ? 0 : (this.phase[i] ?? 0) + dist;
    const ar = this.deps.view.arcade();
    const face = ar ? ar.aim(c.id) : c.dir;
    this.face[i] = face;
    this.spriteOf[i] = c.sprite;

    // A sheet row when the character has one (its own art carries the walk, idle and lean), else the legacy art: the walk
    // cycle by distance walked (all views), the facing, and the procedural lean and bob for 8-way movement and aim.
    const sheet = this.book.has(c.sprite) ? this.sheetFrame(c, i, face, walking || m > 0.05) : undefined;
    const sprite = MAP_SPRITES[c.sprite];
    if (sheet) {
      if (img.texture.key === sheet.texture) img.setFrame(sheet.frame);
      else img.setTexture(sheet.texture, sheet.frame);
      img.setFlipX(sheet.flipX);
      this.lean[i] = 0;
    } else {
      if (sprite) {
        const set = frameSetFor(face);
        const count = framesOf(sprite, set).length;
        const name = frameName(set, m > 0.05 || walking ? walkFrame(this.phase[i] ?? 0, count) : 0);
        if (img.texture.key.startsWith('sheet:')) img.setTexture(`map:${c.sprite}`, name);
        else img.setFrame(name);
      }
      img.setFlipX(flipForDir(face));
    }

    const p = resetPose(this.pose);
    if (!this.reduced && !sheet) {
      const heading = walking ? headingOf(ddx, ddy) : -1;
      const target = (heading >= 0 ? leanFor(heading) * m : 0) + (walking || (face & 1) === 0 ? 0 : leanFor(face) * 0.4);
      this.lean[i] = (this.lean[i] ?? 0) + (target - (this.lean[i] ?? 0)) * follow(dt, 90);
      p.rot = this.lean[i] ?? 0;
      breathe(p, this.animMs + i * 370, 1 - m);
      p.oy -= 1.5 * Math.abs(Math.sin(((this.phase[i] ?? 0) / STRIDE_PX) * Math.PI)) * m;
    }
    if (!this.reduced) {
      const e = this.edge[i] ?? 0;
      if (e !== 0) {
        const age = this.animMs - (this.edgeAt[i] ?? 0);
        const dur = e === 1 ? START_MS : STOP_MS;
        if (age >= dur) this.edge[i] = 0;
        else {
          const bell = Math.sin((Math.PI * age) / dur);
          // Start: a short crouch into the heading; stop: a small rebound as the character settles.
          p.sy *= e === 1 ? 1 - 0.06 * bell : 1 + 0.035 * bell;
          p.sx *= e === 1 ? 1 + 0.04 * bell : 1 - 0.02 * bell;
        }
      }
    }
    if (ar) {
      const g = (this.guard[i] ?? 0) + ((ar.guarding(c.id) ? 1 : 0) - (this.guard[i] ?? 0)) * follow(dt, 70);
      this.guard[i] = g;
      if (!this.reduced) {
        p.sy *= 1 - 0.1 * g;
        p.sx *= 1 + 0.04 * g;
      }
      const k = this.kind[i] ?? 0;
      if (k !== 0) {
        if (this.animMs - (this.kindAt[i] ?? 0) >= (POSE_MS[k] ?? 0)) this.kind[i] = 0;
        else applyPose(p, k, this.animMs - (this.kindAt[i] ?? 0), this.kindDir[i] ?? 1, this.kindPower[i] ?? 0, this.reduced);
      }
      if (this.victoryTeam === c.team) applyPose(p, PoseKind.victory, this.animMs - this.victoryAt, 1, 0, this.reduced);
    }
    this.place(img, c.w * v.scale, c.h * v.scale, p);
  }

  /** The sheet frame to show: a running event pose, the victory, guard, walk (by distance walked) or idle row. */
  private sheetFrame(c: RenderCharacter, i: number, face: number, walking: boolean): SheetFrame | undefined {
    const k = this.kind[i] ?? 0;
    const age = this.animMs - (this.kindAt[i] ?? 0);
    const g = this.guard[i] ?? 0;
    if (k !== 0 && age < (POSE_MS[k] ?? 0)) return this.book.frame(c.sprite, KIND_ACTION[k] ?? 'idle', face, age);
    if (this.victoryTeam === c.team) return this.book.frame(c.sprite, 'victory', face, this.animMs - this.victoryAt);
    if (g > 0.05) return this.book.frame(c.sprite, 'guard', face, g * GUARD_ROW_MS);
    if (walking) return this.book.frame(c.sprite, 'walk', face, walkTime(this.phase[i] ?? 0, STRIDE_PX));
    return this.book.frame(c.sprite, 'idle', face, this.animMs + i * 370);
  }

  /** Applies `p` about the feet centre of the base box (x, y, w, h) the character view just drew. */
  private place(img: Phaser.GameObjects.Image, w: number, h: number, p: Pose): void {
    const still = Math.abs(p.sx - 1) + Math.abs(p.sy - 1) + Math.abs(p.rot) + Math.abs(p.ox) + Math.abs(p.oy) + Math.abs(1 - p.alpha);
    if (still < 1e-4) {
      if (img.rotation !== 0) img.setRotation(0);
      return;
    }
    this.posed++;
    const r = p.rot * DEG;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const bw = w * p.sx;
    const bh = h * p.sy;
    const px = img.x + w / 2 + p.ox;
    const py = img.y + h + p.oy;
    img.setScale(img.scaleX * p.sx, img.scaleY * p.sy);
    img.setRotation(r);
    img.setPosition(px - ((bw / 2) * cos - bh * sin), py - ((bw / 2) * sin + bh * cos));
    if (p.alpha !== 1) img.setAlpha(img.alpha * p.alpha);
  }

  private projectile(p: RenderProjectile): void {
    const v = this.deps.projectiles.peek(p.id);
    if (!v) return;
    const i = p.id & (SLOTS - 1);
    const { image, glow } = v;
    const target = image.angle;
    let fresh = false;
    if (this.pid[i] !== p.id) {
      this.pid[i] = p.id;
      this.born[i] = this.animMs;
      this.ang[i] = target;
      fresh = true;
      if (this.arcade) this.casterOf(p, i);
    } else if (this.dt > 0) {
      this.ang[i] = (this.ang[i] ?? target) + shortestArc(this.ang[i] ?? target, target) * follow(this.dt, ROT_TAU_MS);
    }
    this.seen[i] = this.frameNo;
    if (this.arcade) this.vfx.trail(i, image.x, image.y, this.pel[i] ?? 0, fresh, this.reduced);
    const a = this.ang[i] ?? target;
    const k = easeOutCubic((this.animMs - (this.born[i] ?? 0)) / SPAWN_MS);
    const grow = this.reduced ? 1 : SPAWN_FROM + (1 - SPAWN_FROM) * k;
    image.setAngle(a).setScale(image.scaleX * grow, image.scaleY * grow);
    glow.setAngle(a).setScale(glow.scaleX * grow, glow.scaleY * grow);
    if (k < 1) {
      image.setAlpha(image.alpha * k);
      glow.setAlpha(glow.alpha * k);
    }
    const o = i * 5;
    this.snap[o] = image.x;
    this.snap[o + 1] = image.y;
    this.snap[o + 2] = image.displayWidth;
    this.snap[o + 3] = image.displayHeight;
    this.snap[o + 4] = a;
    this.snapKey[i] = image.texture.key;
    this.snapFrame[i] = image.frame.name;
  }

  /** A projectile first seen: the nearest same-team character just cast it. */
  private casterOf(p: RenderProjectile, slot: number): void {
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < SLOTS; j++) {
      if (this.have[j] !== 1 || this.team[j] !== p.team) continue;
      const d = Math.abs((this.lx[j] ?? 0) - p.x) + Math.abs((this.ly[j] ?? 0) - p.y);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best < 0) return;
    this.start(best, PoseKind.cast, p.dir === 0 || p.dir === 1 || p.dir === 7 ? 1 : -1, 1);
    this.pel[slot] = this.elem[best] ?? 0;
    this.vfx.release(best);
  }

  /** A projectile slot that was not drawn this frame has hit or expired: fade its last pose out. */
  private retire(i: number): void {
    this.pid[i] = -1;
    const o = i * 5;
    if (this.arcade) this.vfx.impact(this.snap[o] ?? 0, this.snap[o + 1] ?? 0, this.pel[i] ?? 0, this.reduced);
    const g = this.free();
    if (!g) return;
    g.kind = 0;
    g.from = this.animMs;
    g.ms = FADE_MS;
    g.x = this.snap[o] ?? 0;
    g.y = this.snap[o + 1] ?? 0;
    g.w = this.snap[o + 2] ?? 0;
    g.h = this.snap[o + 3] ?? 0;
    g.rot = this.snap[o + 4] ?? 0;
    g.image.setTexture(this.snapKey[i] ?? '__DEFAULT', this.snapFrame[i] ?? '').setOrigin(0.5, 0.5).setVisible(true);
  }

  /** The KO fall of character `id`: a ghost copy of its last drawn image falls over and fades while the real one is hidden. */
  private knockOut(id: number): void {
    const v = this.deps.characters.peek(id);
    if (!v) return;
    const img = v.image;
    const g = this.free();
    if (!g) return;
    g.kind = 1;
    g.from = this.animMs;
    g.ms = KO_MS;
    g.dir = img.flipX ? 1 : -1;
    g.w = img.displayWidth;
    g.h = img.displayHeight;
    g.x = img.x + g.w / 2;
    g.y = img.y + g.h;
    g.rot = 0;
    g.sprite = this.spriteOf[id & (SLOTS - 1)] ?? '';
    g.face = this.face[id & (SLOTS - 1)] ?? 0;
    g.image.setTexture(img.texture.key, img.frame.name).setOrigin(0, 0).setFlipX(img.flipX).setVisible(true).setDepth(img.depth);
  }

  private free(): Ghost | undefined {
    for (const g of this.ghosts) if (g.from === Number.NEGATIVE_INFINITY) return g;
    if (this.ghosts.length >= GHOSTS) return undefined;
    const image = this.deps.scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    const g: Ghost = { image, from: Number.NEGATIVE_INFINITY, ms: 0, x: 0, y: 0, w: 0, h: 0, rot: 0, kind: 0, dir: 1, sprite: '', face: 0 };
    this.ghosts.push(g);
    return g;
  }

  private fadeGhosts(): void {
    for (const g of this.ghosts) {
      if (g.from === Number.NEGATIVE_INFINITY) continue;
      const t = (this.animMs - g.from) / g.ms;
      if (t >= 1) {
        g.from = Number.NEGATIVE_INFINITY;
        g.image.setVisible(false);
        continue;
      }
      const img = g.image;
      if (g.kind === 0) {
        const grow = this.reduced ? 1 : 1 + FADE_GROW * easeOutCubic(t);
        img.setPosition(g.x, g.y).setDisplaySize(g.w * grow, g.h * grow).setAngle(g.rot).setAlpha(0.85 * (1 - t));
        img.setDepth(1);
      } else {
        const p = resetPose(this.pose);
        koFall(p, t, g.dir, this.reduced);
        // A sheet's own KO row replaces the procedural fall-over (the fade stays).
        const ko = this.book.has(g.sprite) ? this.book.frame(g.sprite, 'ko', g.face, t * KO_MS) : undefined;
        if (ko) {
          img.setTexture(ko.texture, ko.frame).setFlipX(ko.flipX);
          p.rot = 0;
          p.ox = 0;
          p.oy = 0;
        }
        img.setDisplaySize(g.w, g.h);
        img.setAlpha(p.alpha);
        const r = p.rot * DEG;
        const cos = Math.cos(r);
        const sin = Math.sin(r);
        img.setRotation(r);
        img.setPosition(g.x + p.ox - ((g.w / 2) * cos - g.h * sin), g.y + p.oy - ((g.w / 2) * sin + g.h * cos));
      }
    }
  }

  /** Camera shake decays quadratically with its progress instead of holding its strength and stopping dead. */
  private decayShake(): void {
    const fx = this.deps.scene.cameras.main.shakeEffect;
    if (!fx.isRunning) {
      this.shaking = false;
      return;
    }
    if (!this.shaking) {
      this.shaking = true;
      this.shakeX = fx.intensity.x;
      this.shakeY = fx.intensity.y;
    }
    const k = 1 - fx.progress;
    fx.intensity.set(this.shakeX * k * k, this.shakeY * k * k);
  }

  destroy(): void {
    for (const g of this.ghosts) g.image.destroy();
    this.ghosts.length = 0;
    this.vfx.destroy();
  }
}

const layers = new WeakMap<Phaser.Scene, PoseLayer>();

/** Test probe: the sheets loaded and, per drawn character, the texture, frame, mirror and rotation shown (undefined before the mount). */
export function sheetState(scene: Phaser.Scene): {
  loaded: string[];
  characters: { id: number; texture: string; frame: string; flipX: boolean; rotation: number }[];
} | undefined {
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
