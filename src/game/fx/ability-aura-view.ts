import type Phaser from 'phaser';
import type { RenderCharacter, RenderView } from '@core/index';
import { embers, glowPair, mute, paintEmbers, softFill, softStroke, toPts } from './grim-fx';
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
  readonly pops: readonly { id: number; word: string }[];
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
  readonly x: number;
  readonly y: number;
  readonly born: number;
  text?: Phaser.GameObjects.Text;
}

export function mountAbilityAuraView(arena: Phaser.Scene, view: RenderView, reduceMotion: () => boolean): void {
  let g: Phaser.GameObjects.Graphics | undefined;
  let glowG: Phaser.GameObjects.Graphics | undefined;
  const born = new Map<string, number>();
  let drawn: { id: number; kind: string; shape: string }[] = [];
  let pops: Pop[] = [];
  let lashes: { team: number; x: number; y: number; dir: number; born: number }[] = [];
  let lashDrawn: { team: number; age: number }[] = [];
  const aim = new Map<number, { x: number; y: number; dir: number }>();
  const lastReady = new Map<number, number>();
  let popId = 0;

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
      anchor.set(c.team, { x: c.x + c.w / 2, y: c.y });
      aim.set(c.team, { x: c.x + c.w / 2, y: c.y + c.h / 2, dir: c.dir });
      view.forEachStatus(c.id, (st) => {
        const a = AURAS.find((k) => k.status === st.id);
        if (!a) return;
        const key = `${String(c.id)}:${a.kind}`;
        seen.add(key);
        if (!born.has(key)) born.set(key, now);
        drawn.push({ id: c.id, kind: a.kind, shape: a.shape });
        const age = now - (born.get(key) ?? now);
        for (const poly of auraPolys(a, { x: c.x, y: c.y, w: c.w, h: c.h }, age, reduced)) {
          // Grim look (grim-fx.ts): faint layered fill, smoky underlay, soft glow edge: the shape still codes the buff.
          softFill(gfx, poly.pts, poly.color, 4);
          softStroke(pair, toPts(poly.pts), true, poly.color, 2.6, 0.7);
        }
        // Ash and embers rise off the body in the buff's colour (frozen, still visible, under reduced motion).
        paintEmbers(glow, embers(c.x + c.w / 2, c.y + c.h * 0.7, c.w * 0.7, age, reduced, 10, c.id), a.color, 0.8);
      });
    };
    view.forEachCharacter(visit);
    for (const k of [...born.keys()]) if (!seen.has(k)) born.delete(k);

    for (const team of [0, 1]) {
      const slot = view.actionBar(team)?.abilities.find((s) => s.sprite === 'fireHeal');
      if (!slot) continue;
      const prev = lastReady.get(team);
      lastReady.set(team, slot.readyTick);
      const at = anchor.get(team);
      if (prev !== undefined && slot.readyTick > prev && at) pops.push({ id: ++popId, word: 'HEAL', x: at.x, y: at.y - 8, born: now });
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
        pops.push({ id: ++popId, word: 'SNAG', x: at.x, y: anchor.get(team)?.y ?? at.y - 8, born: now });
      }
    }
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
      const age = now - p.born;
      if (age > POP_TICKS) {
        p.text?.destroy();
        return false;
      }
      const look = popLook(age, reduced);
      p.text ??= arena.add
        .text(p.x, p.y, p.word === 'HEAL' ? `+ ${p.word}` : p.word, { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '20px', fontStyle: 'bold', color: p.word === 'HEAL' ? '#8fb892' : '#b89a68', stroke: '#0a0806', strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH + 1);
      p.text.setPosition(p.x, p.y + look.dy).setAlpha(look.alpha);
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
    lashes = [];
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => ({ auras: drawn, pops: pops.map((p) => ({ id: p.id, word: p.word })), lashes: lashDrawn }));
}
