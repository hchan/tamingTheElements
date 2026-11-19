import Phaser from 'phaser';
import { arcadePlayfield, type RenderView } from '@core/index';
import { DUST_H, DUST_W, SKY_LOOK, paintSkyDust } from '../fx/sky-dust';
import { LOGICAL_HEIGHT, viewHeight } from '../boot/viewport';
import { isPortraitPlay } from '../boot/portrait-play';

const colour: Record<string, number> = { fire: 0x3a1208, water: 0x0a2440, earth: 0x1c2a0e, air: 0x1a2840 };
const mix = (a: number, b: number, t: number): number => {
  const ch = (sh: number): number => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const edge = (scene: Phaser.Scene, key: string | undefined, fallback: number, fromTop: boolean): number => {
  try {
    if (!key || !scene.textures.exists(key)) return fallback;
    const src = scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const cx = probe.getContext('2d', { willReadFrequently: true });
    if (!cx) return fallback;
    // A band a little inside the edge (3% to 9%), so a darkened outermost rim does not make the sky darker than the picture.
    const band = Math.max(2, Math.round(src.height * 0.06));
    const y0 = Math.round(src.height * 0.03);
    cx.drawImage(src, 0, fromTop ? y0 : src.height - y0 - band, src.width, band, 0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return ((d[0] ?? 0) << 16) | ((d[1] ?? 0) << 8) | (d[2] ?? 0);
  } catch {
    return fallback;
  }
};
const rgba = (n: number, a: number): string => `rgba(${String((n >> 16) & 255)},${String((n >> 8) & 255)},${String(n & 255)},${String(a)})`;

/**
 * Portrait tall view only: sky above and ground below the backdrop. The sky is a vertical gradient that starts at the backdrop's own
 * top-row colour (sampled, so there is no seam) and falls off to a much darker tone with a faint haze low down; the ground takes the
 * backdrop's bottom-row colour. Falls back to the stage's edge colour when the art cannot be sampled.
 */
export function mountTallFills(scene: Phaser.Scene, view: RenderView | undefined, element: string, bgKey: string | undefined, cleanups: (() => void)[]): void {
  const w = arcadePlayfield().w + 4000;
  const pw = arcadePlayfield().w;
  const SKY_H = 2400;
  const GRAD_FRAME = 'grad';
  const GRAD_PAD = 4;
  const made: string[] = [];
  /**
   * A 4 x 256 vertical gradient (frame GRAD_FRAME), made once per key. The canvas carries 4 padding rows of the end colours above and
   * below the frame: a bilinear sample at the frame's first or last row would otherwise blend in the opposite end of the texture (a
   * wrapped neighbour), which drew a 2 px dark hairline at the bottom of the fade overlay (the join with the backdrop).
   */
  const gradient = (key: string, stops: readonly (readonly [number, string])[]): string => {
    if (scene.textures.exists(key)) return key;
    const tex = scene.textures.createCanvas(key, 4, 256 + 2 * GRAD_PAD);
    const ctx = tex?.getContext();
    if (!tex || !ctx) return '';
    const g = ctx.createLinearGradient(0, GRAD_PAD, 0, GRAD_PAD + 256);
    for (const [at, c] of stops) g.addColorStop(at, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256 + 2 * GRAD_PAD);
    tex.add(GRAD_FRAME, 0, 0, GRAD_PAD, 4, 256);
    tex.refresh();
    made.push(key);
    return key;
  };
  // The stage's own backdrop (the sim's stage, which the Versus pick steers; not the hero's element), as the terrain view draws it.
  let voidFight = false;
  view?.forEachCharacter((c) => { if (c.element === 'void') voidFight = true; });
  const stageElement = (): string => {
    if (voidFight) return 'void';
    return ['fire', 'water', 'earth', 'air'][(view?.arcade()?.stage ?? 0) - 1] ?? element;
  };
  const keyFor = (el: string): string | undefined => (scene.textures.exists(`bg:${el}`) ? `bg:${el}` : bgKey);
  const first = stageElement();
  const firstKey = keyFor(first);
  const sky = scene.add.image(-2000, -SKY_H, '__DEFAULT').setOrigin(0, 0).setDisplaySize(w, SKY_H).setDepth(-2);
  const ground = scene.add.rectangle(-2000, LOGICAL_HEIGHT, w, 4000, 0).setOrigin(0, 0).setDepth(-2);
  const art = firstKey !== undefined;
  // (The mirrors overlap the backdrop by 2 px, behind it, so a fractional camera zoom cannot show a hairline gap at the joins.)
  // Below the backdrop: its floor mirrored about the bottom edge and dimmed downward to the floor tone, so no flat dark band shows
  // between the arena and the touch area.
  const groundMirror = scene.add.image(0, LOGICAL_HEIGHT - 2, '__DEFAULT').setOrigin(0, 0).setFlipY(true).setDisplaySize(pw, LOGICAL_HEIGHT).setDepth(-1.8);
  const groundFade = scene.add.image(0, LOGICAL_HEIGHT, '__DEFAULT').setOrigin(0, 0).setDisplaySize(pw, LOGICAL_HEIGHT).setDepth(-1.7);
  // The backdrop mirrored about its top edge (a seamless join), then an upright tile above it for the tallest phones, dimmed upward.
  const mirror = scene.add.image(0, 2, '__DEFAULT').setOrigin(0, 1).setFlipY(true).setDisplaySize(pw, LOGICAL_HEIGHT).setDepth(-1.8);
  const upper = scene.add.image(0, 2 - LOGICAL_HEIGHT, '__DEFAULT').setOrigin(0, 1).setDisplaySize(pw, LOGICAL_HEIGHT).setDepth(-1.8);
  const fade = scene.add.image(-2000, -2 * LOGICAL_HEIGHT, '__DEFAULT').setOrigin(0, 0).setDisplaySize(w, 2 * LOGICAL_HEIGHT).setDepth(-0.915);
  // The terrain view's additive "light lift" wash (fx/terrain-ambient, depth -0.78) starts with a hard edge at world y 0; continue it
  // upward as a fading ramp so the join with the sky is not a brightness step. Same per-stage colours as that file's LOOK table.
  const LIFT: Record<string, number> = { fire: 0x120a06, water: 0x081420, earth: 0x0e1408, air: 0x0a0e1a };
  const LIFT_RAMP = 360;
  const liftRamp = scene.add.image(0, -LIFT_RAMP, '__DEFAULT').setOrigin(0, 0).setDisplaySize(pw, LIFT_RAMP).setDepth(-0.78).setBlendMode('ADD');
  // The sky band's dressing (fx/sky-dust): a stage-coloured horizon glow rising from the join, and a drifting mote field above it.
  const GLOW_H = 840; // from 640 above the join to 200 below it (over the far wall), where it has faded out
  const DUST_SCALE = 2;
  const glow = scene.add.image(0, -640, '__DEFAULT').setOrigin(0, 0).setDisplaySize(pw, GLOW_H).setDepth(-0.8).setBlendMode('ADD');
  const dust = scene.add.tileSprite(0, -DUST_H * DUST_SCALE, pw, DUST_H * DUST_SCALE, '__DEFAULT').setOrigin(0, 0).setDepth(-0.9).setTileScale(DUST_SCALE, DUST_SCALE);
  let shown = '';
  const apply = (el: string): void => {
    const look = SKY_LOOK[el];
    if (look) {
      const glowKey = gradient(`tall-glow:${String(look.glow)}`, [[0, rgba(look.glow, 0)], [0.5, rgba(look.glow, 0.06)], [0.74, rgba(look.glow, 0.26)], [1, rgba(look.glow, 0)]]);
      if (glowKey) glow.setTexture(glowKey, GRAD_FRAME).setDisplaySize(pw, GLOW_H);
      const dustKey = `tall-dust:${el}`;
      if (!scene.textures.exists(dustKey)) {
        const tex = scene.textures.createCanvas(dustKey, DUST_W, DUST_H);
        const dctx = tex?.getContext();
        if (tex && dctx) {
          paintSkyDust(dctx, el);
          tex.refresh();
          made.push(dustKey);
        }
      }
      if (scene.textures.exists(dustKey)) dust.setTexture(dustKey);
    }
    const lift = LIFT[el];
    const liftKey = lift === undefined ? '' : gradient(`tall-lift:${String(lift)}`, [[0, rgba(lift, 0)], [1, rgba(lift, 1)]]);
    if (liftKey) liftRamp.setTexture(liftKey, GRAD_FRAME).setDisplaySize(pw, LIFT_RAMP);
    const key = keyFor(el);
    const fallback = colour[el] ?? 0x120a1c;
    // The drawn picture is warmer and lighter than its raw edge pixels (the stage tint), so pull the sample toward the stage palette.
    const top = mix(edge(scene, key, fallback, true), mix(fallback, 0xffffff, 0.12), 0.5);
    const deep = mix(top, 0x05060c, 0.72);
    const skyKey = gradient(`tall-sky:${String(top)}`, [[0, css(deep)], [1, css(mix(top, deep, 0.7))]]);
    if (skyKey) sky.setTexture(skyKey, GRAD_FRAME).setDisplaySize(w, SKY_H);
    const floor = edge(scene, key, fallback, false);
    ground.setFillStyle(mix(floor, 0x05060c, 0.45));
    if (key) {
      // Dim the mirrored art and the stage's far layer (which starts 316 px above the backdrop, its top edge was the hard seam) upward:
      // strong at the top, still strong where the far layer starts, easing to clear at the join with the real backdrop (no brightness step).
      const toneEnd = mix(top, deep, 0.7);
      // (Opaque at its very top in the sky gradient's own colour there, so the overlay's top edge does not show on the tallest phones.)
      const fadeKey = gradient(`tall-fade2:${String(top)}`, [[0, rgba(mix(deep, toneEnd, 0.4), 1)], [0.6, rgba(toneEnd, 0.96)], [0.78, rgba(toneEnd, 0.95)], [0.86, rgba(toneEnd, 0.6)], [0.93, rgba(toneEnd, 0.25)], [1, rgba(toneEnd, 0)]]);
      if (fadeKey) fade.setTexture(fadeKey, GRAD_FRAME).setDisplaySize(w, 2 * LOGICAL_HEIGHT);
      const toneLow = mix(floor, 0x05060c, 0.45);
      const gKey = gradient(`tall-gfade:${String(floor)}`, [[0, rgba(toneLow, 0)], [1, rgba(toneLow, 0.95)]]);
      if (gKey) groundFade.setTexture(gKey, GRAD_FRAME).setDisplaySize(pw, LOGICAL_HEIGHT);
      for (const im of [mirror, upper, groundMirror]) im.setTexture(key);
      mirror.setDisplaySize(pw, LOGICAL_HEIGHT);
      upper.setDisplaySize(pw, LOGICAL_HEIGHT);
      groundMirror.setDisplaySize(pw, LOGICAL_HEIGHT);
    }
    shown = el;
  };
  apply(first);
  const artLayers = [groundMirror, groundFade, mirror, upper, fade];
  const sync = (): void => {
    const on = viewHeight(scene) > LOGICAL_HEIGHT + 0.5 && isPortraitPlay(scene.game);
    sky.setVisible(on);
    ground.setVisible(on);
    for (const e of artLayers) e.setVisible(on && art);
    if (on) {
      const el = stageElement();
      if (el !== shown) apply(el);
    }
    liftRamp.setVisible(on && LIFT[shown] !== undefined);
    glow.setVisible(on && SKY_LOOK[shown] !== undefined);
    dust.setVisible(on && SKY_LOOK[shown] !== undefined);
  };
  // A slow sideways drift of the mote field (view time, so it does not touch the sim).
  const drift = (_time: number, delta: number): void => {
    if (dust.visible) dust.tilePositionX += delta * 0.004;
  };
  sync();
  scene.scale.on('resize', sync);
  scene.events.on(Phaser.Scenes.Events.UPDATE, sync);
  scene.events.on(Phaser.Scenes.Events.UPDATE, drift);
  cleanups.push(() => {
    scene.scale.off('resize', sync);
    scene.events.off(Phaser.Scenes.Events.UPDATE, sync);
    scene.events.off(Phaser.Scenes.Events.UPDATE, drift);
    for (const k of made) if (scene.textures.exists(k)) scene.textures.remove(k);
  });
}
