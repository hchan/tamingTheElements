import type Phaser from 'phaser';
import { LaneWait, centreBusy } from '../hud/banner-lanes';
import { arcadeHeroScale, visualBox } from '../views/hero-scale';
import { arcadePlayfield, type RenderCharacter, type RenderView } from '@core/index';
import { embers, glowPair, mute, paintEmbers, softFill, softStroke, toPts } from './grim-fx';
import { popCeil, popLaneLift } from './pop-lanes';
import { CHIP_RECTS_KEY, hudFrame, projectToHud, viewOfCamera, type HudRect } from '../hud/arcade-hud';
import { viewHeight, viewWidth } from '../boot/viewport';
import { GORE_COLOR, GORE_POP, GORE_SPRITE, GORE_TICKS, HIDE_COLOR, HIDE_POP, HIDE_SPRITE, HIDE_TICKS, forgeGore, moltenHide } from './brazgor-fx';
import { BITE_COLOR, BITE_POP, BITE_SPRITE, BITE_TICKS, SPRAY_COLOR, SPRAY_POP, SPRAY_SPRITE, SPRAY_TICKS, cinderSpray, emberBite } from './kindrel-fx';
import { HURL_FLIGHT, HURL_HIT_TICKS, ROLL_FLIGHT, ROLL_HIT_TICKS, hurlImpact, paintRockHit, rollImpact } from './quarrak-hit-fx';
import { HURL_POP, HURL_SPRITE, HURL_TICKS, ROLL_POP, ROLL_SPRITE, ROLL_TICKS, boulderRoll, hurlRock, paintRock } from './quarrak-fx';
import { BREATH_BOX, BREATH_COLOR, BREATH_POP, BREATH_SPRITE, BREATH_TICKS, COIL_BOX, COIL_COLOR, COIL_POP, COIL_SPRITE, COIL_TICKS, meleeBox, scorchBreath, wyrmCoil, type Box } from './ouroth-fx';
import { SKITTER_COLOR, SKITTER_POP, SKITTER_SPRITE, SKITTER_TICKS, skitterHop } from './zephra-fx';
import { MEND_COLOR, MEND_POP, MEND_SPRITE, MEND_TICKS, SPORE_COLOR, SPORE_DARK, SPORE_SPRITE, SPORE_TICKS, myceliumMend, sporeBurst } from './umbrel-fx';
import { mountStingFx } from './sting-fx';
import { AURAS, LASH_TICKS, SNAG_ROPE_COLOR, SNAG_SPRITE, auraPolys, POP_TICKS, popLook, snagLash } from './ability-aura';

/**
 * Phaser side of the buff auras and the Fire Heal pop (see ability-aura.ts). Lazy chunk mounted by the Arena: one Graphics
 * redrawn on `postupdate` for the auras, plus a Text per live pop. Ages count view ticks from first sight, so they hold while
 * the sim is paused. Fire Heal has no sim event, so a cast is a rise of the action-bar slot's `readyTick`. Removed with the scene.
 */
const DEPTH = 6;
const BENCHED_OR_DEAD = 16 | 32;

export interface AbilityFxProbe {
  readonly auras: readonly { id: number; kind: string; shape: string }[];
  /** Pops with their on-screen top (world `y`/`top`; HUD px `hudTop`, `hudX0`..`hudX1`) and the HUD y they must stay below (`ceil`). */
  readonly pops: readonly { id: number; word: string; x: number; y: number; top: number; hudTop: number; hudX0: number; hudX1: number; ceil: number }[];
  /** Snag cast lashes live on the last frame (team, view ticks since the cast). */
  readonly lashes: readonly { team: number; age: number }[];
}

const states = new WeakMap<Phaser.Scene, () => AbilityFxProbe>();

/** What was drawn on the last frame (test probe), or undefined before the view mounts or after teardown. */
export function abilityFxState(arena: Phaser.Scene): AbilityFxProbe | undefined {
  return states.get(arena)?.();
}

interface Pop {
  readonly id: number;
  readonly word: string;
  /** The team whose fighter it follows (the pop rides the fighter's head, so it never floats off when they move). */
  readonly team: number;
  x: number;
  y: number;
  /** Lane lift (px): stacked above other live pops near it. */
  lift: number;
  born: number;
  text?: Phaser.GameObjects.Text;
  /** Waits for the centre lane (banner-lanes.ts) while the super cut-in or a round banner is up. */
  wait: LaneWait;
  seen: number;
}

export function mountAbilityAuraView(arena: Phaser.Scene, view: RenderView, reduceMotion: () => boolean): void {
  mountStingFx(arena, view, reduceMotion);
  let g: Phaser.GameObjects.Graphics | undefined;
  let glowG: Phaser.GameObjects.Graphics | undefined;
  const born = new Map<string, number>();
  let drawn: { id: number; kind: string; shape: string }[] = [];
  let pops: Pop[] = [];
  let lashes: { team: number; x: number; y: number; dir: number; born: number }[] = [];
  let kfx: { kind: 'bite' | 'spray' | 'gore' | 'hide' | 'hurl' | 'roll' | 'hurlhit' | 'rollhit' | 'coil' | 'breath' | 'skitter' | 'spore' | 'mend'; x: number; y: number; dir: number; born: number; box?: Box }[] = [];
  let lashDrawn: { team: number; age: number }[] = [];
  const aim = new Map<number, { x: number; y: number; dir: number }>();
  /** Each fighter's sim box (top-left, size), for FX drawn to a melee hitbox. */
  const simBox = new Map<number, Box>();
  const lastReady = new Map<number, number>();
  let popId = 0;
  const camView = { x: 0, y: 0, w: 0, h: 0 };
  const toFrame = { x: 0, y: 0, w: 0, h: 0 };
  const pt = { x: 0, y: 0 };
  const ceils = new Map<number, { hudTop: number; hudX0: number; hudX1: number; ceil: number }>();
  let lastRound = -1;

  const draw = (): void => {
    const reduced = reduceMotion();
    const now = view.tick;
    drawn = [];
    const seen = new Set<string>();
    const anchor = new Map<number, { x: number; y: number }>();
    const gfx = (g ??= arena.add.graphics().setDepth(DEPTH));
    gfx.clear();
    const glow = (glowG ??= arena.add.graphics().setDepth(DEPTH + 0.1));
    glow.clear();
    const pair = glowPair(gfx, glow);
    const visit = (c: RenderCharacter): void => {
      if ((c.flags & BENCHED_OR_DEAD) !== 0) return;
      const vb = visualBox(c.x, c.y, c.w, c.h, view.arcade() ? arcadeHeroScale(c.h) : 1, { x: 0, y: 0, w: 0, h: 0 }, view.arcade() ? arcadePlayfield().w : undefined);
      anchor.set(c.team, { x: vb.x + vb.w / 2, y: vb.y });
      aim.set(c.team, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2, dir: c.dir });
      simBox.set(c.team, { x: c.x, y: c.y, w: c.w, h: c.h });
      view.forEachStatus(c.id, (st) => {
        const a = AURAS.find((k) => k.status === st.id);
        if (!a) return;
        const key = `${String(c.id)}:${a.kind}`;
        seen.add(key);
        if (!born.has(key)) born.set(key, now);
        drawn.push({ id: c.id, kind: a.kind, shape: a.shape });
        const age = now - (born.get(key) ?? now);
        for (const poly of auraPolys(a, vb, age, reduced)) {
          // Grim look (grim-fx.ts): faint layered fill, smoky underlay, soft glow edge: the shape still codes the buff.
          softFill(gfx, poly.pts, poly.color, 4);
          softStroke(pair, toPts(poly.pts), true, poly.color, 2.6, 0.7);
        }
        // Ash and embers rise off the body in the buff's colour (frozen, still visible, under reduced motion).
        paintEmbers(glow, embers(vb.x + vb.w / 2, vb.y + vb.h * 0.7, vb.w * 0.7, age, reduced, 10, c.id), a.color, 0.8);
      });
    };
    view.forEachCharacter(visit);
    for (const k of [...born.keys()]) if (!seen.has(k)) born.delete(k);

    // A new round starts clean: the last round's SNAG / HEAL pops and lashes never ride under the ROUND / FIGHT! banners, and the
    // cooldown reset that comes with the round is not read as a cast.
    const round = view.arcade()?.round ?? 0;
    if (round !== lastRound) {
      if (lastRound !== -1) {
        for (const p of pops) p.text?.destroy();
        pops = [];
        lashes = [];
        kfx = [];
        lastReady.clear();
      }
      lastRound = round;
    }
    for (const team of [0, 1]) {
      const slot = view.actionBar(team)?.abilities.find((s) => s.sprite === 'fireHeal');
      if (!slot) continue;
      const prev = lastReady.get(team);
      lastReady.set(team, slot.readyTick);
      const at = anchor.get(team);
      if (prev !== undefined && slot.readyTick > prev && at) pops.push({ id: ++popId, word: 'HEAL', team, x: at.x, y: at.y - 8, lift: popLaneLift(pops, at.x, at.y - 8), born: now, wait: new LaneWait(), seen: now });
    }
    for (const team of [0, 1]) {
      const slot = view.actionBar(team)?.abilities.find((s) => s.sprite === SNAG_SPRITE);
      if (!slot) continue;
      const key = team + 2;
      const prev = lastReady.get(key);
      lastReady.set(key, slot.readyTick);
      const at = aim.get(team);
      if (prev !== undefined && slot.readyTick > prev && at) {
        lashes.push({ team, ...at, born: now });
        const py = anchor.get(team)?.y ?? at.y - 8;
        pops.push({ id: ++popId, word: 'SNAG', team, x: at.x, y: py, lift: popLaneLift(pops, at.x, py), born: now, wait: new LaneWait(), seen: now });
      }
    }
    // Kindrel (roster24): Ember Bite slashes and Cinder Spray rings, read from the slot's readyTick like the casts above.
    const kindrelCasts = [
      { sprite: BITE_SPRITE, kind: 'bite' as const, word: BITE_POP, base: 4 },
      { sprite: SPRAY_SPRITE, kind: 'spray' as const, word: SPRAY_POP, base: 6 },
      // Brazgor (roster24): Forge Gore blow and Molten Hide glow, same readyTick read.
      { sprite: GORE_SPRITE, kind: 'gore' as const, word: GORE_POP, base: 8 },
      { sprite: HIDE_SPRITE, kind: 'hide' as const, word: HIDE_POP, base: 10 },
      // Quarrak (roster24): thrown rock and rolling boulder with dust, same readyTick read (no word pop: the projectile is the cue).
      { sprite: HURL_SPRITE, kind: 'hurl' as const, word: HURL_POP, base: 12 },
      { sprite: ROLL_SPRITE, kind: 'roll' as const, word: ROLL_POP, base: 14 },
      // Ouroth (roster24): Wyrm Coil and Scorch Breath, drawn to the sim's melee hitbox.
      { sprite: COIL_SPRITE, kind: 'coil' as const, word: COIL_POP, base: 18 },
      { sprite: BREATH_SPRITE, kind: 'breath' as const, word: BREATH_POP, base: 20 },
      // Zephra (roster24): Skitter's hop streaks and landing puff.
      { sprite: SKITTER_SPRITE, kind: 'skitter' as const, word: SKITTER_POP, base: 16 },
      // Umbrel (roster24): Spore Burst cloud over the projectile (no word: the cloud is the cue) and Mycelium Mend threads.
      { sprite: SPORE_SPRITE, kind: 'spore' as const, word: '', base: 22 },
      { sprite: MEND_SPRITE, kind: 'mend' as const, word: MEND_POP, base: 24 },
    ];
    for (const team of [0, 1]) {
      for (const k of kindrelCasts) {
        const slot = view.actionBar(team)?.abilities.find((s) => s.sprite === k.sprite);
        if (!slot) continue;
        const key = team + k.base * 2;
        const prev = lastReady.get(key);
        lastReady.set(key, slot.readyTick);
        const at = aim.get(team);
        if (prev === undefined || slot.readyTick <= prev || !at) continue;
        const me = simBox.get(team);
        const size = k.kind === 'coil' ? COIL_BOX : BREATH_BOX;
        const box = me && (k.kind === 'coil' || k.kind === 'breath') ? meleeBox(at.dir, me.x, me.y, me.w, me.h, size.w, size.h) : undefined;
        kfx.push({ kind: k.kind, ...at, born: now, box });
        // Quarrak's rock bursts where its flight ends: born in the future, drawn from then (age < 0 holds below).
        if (k.kind === 'hurl' || k.kind === 'roll') kfx.push({ kind: k.kind === 'hurl' ? 'hurlhit' : 'rollhit', ...at, born: now + (k.kind === 'hurl' ? HURL_FLIGHT : ROLL_FLIGHT) });
        if (k.kind !== 'bite' && k.kind !== 'hurl' && k.kind !== 'roll' && k.kind !== 'spore') {
          const py = anchor.get(team)?.y ?? at.y - 8;
          pops.push({ id: ++popId, word: k.word, team, x: at.x, y: py, lift: popLaneLift(pops, at.x, py), born: now, wait: new LaneWait(), seen: now });
        }
      }
    }
    kfx = kfx.filter((f) => {
      const age = now - f.born;
      if (age < 0) return true;
      if (f.kind === 'hurlhit' || f.kind === 'rollhit') {
        const h = f.kind === 'hurlhit' ? hurlImpact(f.x, f.y, f.dir, age, reduced) : rollImpact(f.x, f.y, f.dir, age, reduced);
        if (!h) return false;
        paintRockHit(gfx, glow, h);
        return age <= (f.kind === 'hurlhit' ? HURL_HIT_TICKS : ROLL_HIT_TICKS);
      }
      if (f.kind === 'bite') {
        const b = emberBite(f.x, f.y, f.dir, age, reduced);
        if (!b) return false;
        for (const arc of b.arcs) {
          const pts = toPts(arc);
          gfx.lineStyle(9, 0x000000, 0.24 * b.alpha).strokePoints(pts, false);
          gfx.lineStyle(5, BITE_COLOR, 0.9 * b.alpha).strokePoints(pts, false);
          gfx.lineStyle(1.5, 0xffc060, 0.8 * b.alpha).strokePoints(pts, false);
          glow.lineStyle(12, BITE_COLOR, 0.16 * b.alpha).strokePoints(pts, false);
        }
        paintEmbers(glow, b.sparks.map((sp) => ({ x: sp.x, y: sp.y, r: sp.r, a: b.alpha })), BITE_COLOR, 0.9);
        return age <= BITE_TICKS;
      }
      if (f.kind === 'hurl' || f.kind === 'roll') {
        const r = f.kind === 'hurl' ? hurlRock(f.x, f.y, f.dir, age, reduced) : boulderRoll(f.x, f.y, f.dir, age, reduced);
        if (!r) return false;
        paintRock(gfx, glow, r);
        return age <= (f.kind === 'hurl' ? HURL_TICKS : ROLL_TICKS);
      }
      if (f.kind === 'coil' && f.box) {
        const c = wyrmCoil(f.box, f.dir, age, reduced);
        if (!c) return false;
        const frame = toPts(c.box);
        gfx.lineStyle(2, COIL_COLOR, 0.3 * c.alpha).strokePoints(frame, true);
        for (const band of c.bands) {
          const pts = toPts(band);
          gfx.lineStyle(14, 0x000000, 0.26 * c.alpha).strokePoints(pts, false);
          gfx.lineStyle(9, COIL_COLOR, 0.85 * c.alpha).strokePoints(pts, false);
          gfx.lineStyle(2, mute(0xd8b060, 0.5, 1.2), 0.7 * c.alpha).strokePoints(pts, false);
          glow.lineStyle(16, BREATH_COLOR, 0.12 * c.alpha).strokePoints(pts, false);
        }
        paintEmbers(glow, c.sparks.map((sp) => ({ x: sp.x, y: sp.y, r: sp.r, a: c.alpha })), BREATH_COLOR, 0.9);
        return age <= COIL_TICKS;
      }
      if (f.kind === 'breath' && f.box) {
        const b = scorchBreath(f.box, f.dir, age, reduced);
        if (!b) return false;
        gfx.lineStyle(2, BREATH_COLOR, 0.25 * b.alpha).strokePoints(toPts(b.box), true);
        for (const tongue of b.tongues) {
          softFill(gfx, tongue, BREATH_COLOR, 5 * b.alpha);
          gfx.fillStyle(0x000000, 0.14 * b.alpha).fillPoints(toPts(tongue), true);
          gfx.fillStyle(BREATH_COLOR, 0.55 * b.alpha).fillPoints(toPts(tongue), true);
          glow.lineStyle(10, BREATH_COLOR, 0.14 * b.alpha).strokePoints(toPts(tongue), true);
          gfx.lineStyle(1.5, 0xffc060, 0.7 * b.alpha).strokePoints(toPts(tongue), true);
        }
        paintEmbers(glow, b.embers.map((e) => ({ x: e.x, y: e.y, r: e.r, a: b.alpha })), BREATH_COLOR, 0.9);
        return age <= BREATH_TICKS;
      }
      if (f.kind === 'skitter') {
        const h = skitterHop(f.x, f.y, f.dir, age, reduced);
        if (!h) return false;
        for (const s of h.streaks) {
          gfx.lineStyle(6, 0x000000, 0.16 * h.alpha).lineBetween(s.x0, s.y0, s.x1, s.y1);
          gfx.lineStyle(2.5, SKITTER_COLOR, 0.7 * h.alpha).lineBetween(s.x0, s.y0, s.x1, s.y1);
          glow.lineStyle(8, SKITTER_COLOR, 0.1 * h.alpha).lineBetween(s.x0, s.y0, s.x1, s.y1);
        }
        gfx.lineStyle(5, 0x000000, 0.16 * h.alpha).strokeCircle(h.puff.x, h.puff.y, h.puff.r);
        gfx.lineStyle(2, SKITTER_COLOR, 0.55 * h.alpha).strokeCircle(h.puff.x, h.puff.y, h.puff.r);
        paintEmbers(glow, h.motes.map((m) => ({ x: m.x, y: m.y, r: m.r, a: h.alpha })), SKITTER_COLOR, 0.9);
        return age <= SKITTER_TICKS;
      }
      if (f.kind === 'spore') {
        const sp = sporeBurst(f.x, f.y, f.dir, age, reduced);
        if (!sp) return false;
        for (const p of sp.puffs) {
          glow.fillStyle(SPORE_COLOR, p.a * 0.35 * sp.alpha).fillCircle(p.x, p.y, p.r * 1.5);
          gfx.fillStyle(SPORE_DARK, p.a * 0.3 * sp.alpha).fillCircle(p.x + 2, p.y + 2, p.r);
          gfx.fillStyle(SPORE_COLOR, p.a * 0.6 * sp.alpha).fillCircle(p.x, p.y, p.r);
        }
        paintEmbers(glow, sp.trail.map((m) => ({ x: m.x, y: m.y, r: m.r, a: m.a * sp.alpha })), SPORE_COLOR, 0.9);
        return age <= SPORE_TICKS;
      }
      if (f.kind === 'mend') {
        const m = myceliumMend(f.x, f.y, age, reduced);
        if (!m) return false;
        gfx.lineStyle(5, 0x000000, 0.16 * m.alpha).strokeEllipse(m.ring.x, m.ring.y, m.ring.r * 2, m.ring.r * 0.7);
        gfx.lineStyle(2, MEND_COLOR, 0.6 * m.alpha).strokeEllipse(m.ring.x, m.ring.y, m.ring.r * 2, m.ring.r * 0.7);
        for (const th of m.threads) {
          const pts = toPts(th);
          gfx.lineStyle(5, 0x000000, 0.18 * m.alpha).strokePoints(pts, false);
          gfx.lineStyle(2.5, MEND_COLOR, 0.8 * m.alpha).strokePoints(pts, false);
          glow.lineStyle(9, SPORE_COLOR, 0.12 * m.alpha).strokePoints(pts, false);
        }
        paintEmbers(glow, m.motes.map((e) => ({ x: e.x, y: e.y, r: e.r, a: e.a * m.alpha })), SPORE_COLOR, 0.9);
        return age <= MEND_TICKS;
      }
      if (f.kind === 'gore') {
        const g = forgeGore(f.x, f.y, f.dir, age, reduced);
        if (!g) return false;
        const pts = toPts(g.arc);
        gfx.lineStyle(9, 0x000000, 0.22 * g.alpha).strokePoints(pts, false);
        gfx.lineStyle(4.5, GORE_COLOR, 0.8 * g.alpha).strokePoints(pts, false);
        glow.lineStyle(12, GORE_COLOR, 0.12 * g.alpha).strokePoints(pts, false);
        gfx.lineStyle(3, GORE_COLOR, 0.6 * g.alpha).strokeCircle(g.impact.x, g.impact.y, g.impact.r);
        paintEmbers(glow, g.sparks.map((sp) => ({ x: sp.x, y: sp.y, r: sp.r, a: g.alpha })), GORE_COLOR, 0.9);
        return age <= GORE_TICKS;
      }
      if (f.kind === 'hide') {
        const h = moltenHide(f.x, f.y, age, reduced);
        if (!h) return false;
        gfx.lineStyle(5, 0x000000, 0.18 * h.alpha).strokeCircle(h.ring.x, h.ring.y, h.ring.r);
        gfx.lineStyle(2.5, HIDE_COLOR, 0.65 * h.alpha).strokeCircle(h.ring.x, h.ring.y, h.ring.r);
        glow.lineStyle(10, HIDE_COLOR, 0.12 * h.alpha).strokeCircle(h.ring.x, h.ring.y, h.ring.r);
        paintEmbers(glow, h.embers.map((e) => ({ x: e.x, y: e.y, r: e.r, a: h.alpha })), HIDE_COLOR, 0.9);
        return age <= HIDE_TICKS;
      }
      const sp = cinderSpray(f.x, f.y, age, reduced);
      if (!sp) return false;
      gfx.lineStyle(6, 0x000000, 0.18 * sp.alpha).strokeCircle(sp.ring.x, sp.ring.y, sp.ring.r);
      gfx.lineStyle(2.5, SPRAY_COLOR, 0.6 * sp.alpha).strokeCircle(sp.ring.x, sp.ring.y, sp.ring.r);
      glow.lineStyle(10, SPRAY_COLOR, 0.1 * sp.alpha).strokeCircle(sp.ring.x, sp.ring.y, sp.ring.r);
      paintEmbers(glow, sp.embers.map((e) => ({ x: e.x, y: e.y, r: e.r, a: sp.alpha })), SPRAY_COLOR, 0.9);
      return age <= SPRAY_TICKS;
    });
    lashDrawn = [];
    lashes = lashes.filter((l) => {
      const age = now - l.born;
      const lash = snagLash(l.x, l.y, l.dir, age, reduced);
      if (!lash) return false;
      lashDrawn.push({ team: l.team, age });
      // A frayed, dark rope: smoky underlay, a muted cord, a thin pale fibre line; the knot is a soft ring, not a white circle.
      const rope = toPts(lash.pts);
      gfx.lineStyle(10, 0x000000, 0.22 * lash.alpha).strokePoints(rope, false);
      gfx.lineStyle(5, SNAG_ROPE_COLOR, 0.8 * lash.alpha).strokePoints(rope, false);
      glow.lineStyle(1.5, mute(SNAG_ROPE_COLOR, 0.5, 1.5), 0.35 * lash.alpha).strokePoints(rope, false);
      gfx.lineStyle(7, 0x000000, 0.2 * lash.alpha).strokeCircle(lash.knot.x, lash.knot.y, lash.knot.r);
      gfx.lineStyle(3, SNAG_ROPE_COLOR, 0.7 * lash.alpha).strokeCircle(lash.knot.x, lash.knot.y, lash.knot.r);
      glow.lineStyle(8, SNAG_ROPE_COLOR, 0.08 * lash.alpha).strokeCircle(lash.knot.x, lash.knot.y, lash.knot.r);
      return age <= LASH_TICKS;
    });
    pops = pops.filter((p) => {
      // A pop that lands under the cut-in or a banner holds its start (hidden) until the centre clears, at most LANE_MAX_WAIT_TICKS.
      const dt = now - p.seen;
      p.seen = now;
      if (!p.text && p.wait.hold(centreBusy(arena.registry), dt)) {
        p.born += dt;
        return true;
      }
      const age = now - p.born;
      if (age > POP_TICKS) {
        ceils.delete(p.id);
        p.text?.destroy();
        return false;
      }
      const look = popLook(age, reduced);
      // SNAG is a pale parchment with a thick dark outline (it was a dim tan that read grey over the lava floor, QA r77).
      p.text ??= arena.add
        .text(p.x, p.y, p.word === 'HEAL' ? `+ ${p.word}` : p.word, { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '20px', fontStyle: 'bold', color: p.word === 'HEAL' ? '#8fb892' : p.word === SPRAY_POP || p.word === GORE_POP || p.word === HIDE_POP || p.word === COIL_POP || p.word === BREATH_POP ? '#f0b070' : p.word === SKITTER_POP ? '#c4cdc8' : p.word === MEND_POP ? '#c8c48a' : '#f4e6c0', stroke: '#0a0806', strokeThickness: p.word === 'HEAL' ? 3 : 6 })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH + 1);
      const head = anchor.get(p.team);
      if (head) { p.x = head.x; p.y = head.y - 8; }
      // Stay below the scrim and the status chips (they draw over the Arena): clamp the word's top to the chips' bottom.
      let bottom = p.y - p.lift + look.dy;
      const cam = arena.cameras.main;
      const from: HudRect = viewOfCamera(cam, camView);
      const to: HudRect = hudFrame(viewWidth(arena), toFrame, viewHeight(arena));
      const hw = (p.text.displayWidth / from.w) * to.w;
      const hx = projectToHud(p.x, bottom, from, to, pt).x;
      const ceil = popCeil(arena.registry.get(CHIP_RECTS_KEY) as HudRect[][] | undefined, hx - hw / 2, hx + hw / 2);
      const ceilWorld = projectToHud(hx, ceil, to, from, pt).y;
      bottom = Math.max(bottom, ceilWorld + p.text.displayHeight);
      p.text.setPosition(p.x, bottom).setAlpha(look.alpha);
      ceils.set(p.id, { hudTop: projectToHud(p.x, bottom - p.text.displayHeight, from, to, pt).y, hudX0: hx - hw / 2, hudX1: hx + hw / 2, ceil });
      return true;
    });
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    g?.destroy();
    g = undefined;
    glowG?.destroy();
    glowG = undefined;
    for (const p of pops) p.text?.destroy();
    pops = [];
    ceils.clear();
    lashes = [];
    kfx = [];
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => ({ auras: drawn, pops: pops.map((p) => ({ id: p.id, word: p.word, x: p.text?.x ?? p.x, y: p.text?.y ?? p.y, top: (p.text?.y ?? p.y) - (p.text?.displayHeight ?? 0), hudTop: ceils.get(p.id)?.hudTop ?? 0, hudX0: ceils.get(p.id)?.hudX0 ?? 0, hudX1: ceils.get(p.id)?.hudX1 ?? 0, ceil: ceils.get(p.id)?.ceil ?? 0 })), lashes: lashDrawn }));
}
