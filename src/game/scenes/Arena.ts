import Phaser from 'phaser';
import {
  DEFAULT_SIM_FLAGS,
  EntityFlag,
  EntityKind,
  MAX_ENTITIES,
  hash,
  RandomBot,
  SIM_VERSION,
  characterId,
  collectCommands,
  createMatch,
  createRenderView,
  step,
  type Agent,
  type RenderCharacter,
  type RenderView,
} from '@core/index';
import type { ProbeCharacter } from '../platform/test-hook';
import { FixedStepDriver } from '../loop/fixed-step-driver';
import { CharacterView } from '../views/character-view';
import { EntityViewPool } from '../views/entity-view-pool';
import { HUD_SCENE, type HudData } from './Hud';

export const ARENA_SCENE = 'Arena';

/**
 * Thin arena view: the sim steps at a fixed 50 Hz inside `update`, and every render reads the
 * RenderView facade and interpolates prev -> cur by the driver's alpha. No gameplay logic here.
 * Demo mode (`?ff=arenaDemo`): random bot vs random bot.
 */
export class Arena extends Phaser.Scene {
  private view: RenderView | undefined;
  private driver: FixedStepDriver | undefined;
  private pool: EntityViewPool<CharacterView> | undefined;
  private agents: readonly [Agent, Agent] = [new RandomBot('p1'), new RandomBot('p2')];

  constructor() {
    super(ARENA_SCENE);
  }

  create(): void {
    const world = createMatch({
      simVersion: SIM_VERSION,
      seed: 1,
      flags: DEFAULT_SIM_FLAGS,
      chapter: 1,
      difficulty: 1,
      p1: [
        { character: characterId('curomo'), xp: 0 },
        { character: characterId('fiara'), xp: 0 },
      ],
      p2: [
        { character: characterId('pax'), xp: 0 },
        { character: characterId('cyclonius'), xp: 0 },
      ],
    });
    this.view = createRenderView(world);
    this.driver = new FixedStepDriver({
      tick: () => {
        step(world, collectCommands(world, this.agents));
      },
      now: () => performance.now(),
    });
    this.pool = new EntityViewPool(
      () => new CharacterView(this),
      (v) => {
        v.hide();
      },
    );

    const { width, height } = this.scale;
    const element = this.view.heroElement();
    const bg = element && this.textures.exists(`bg:${element}`) ? element : undefined;
    if (bg) this.add.image(0, 0, `bg:${bg}`).setOrigin(0, 0).setDisplaySize(width, height).setDepth(-1);

    // Test-build-only hook (statically removed from production builds).
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      const hook = window.__TTE__;
      const driver = this.driver;
      const view = this.view;
      if (hook) {
        // `&manual=1` starts paused so e2e controls every tick (no real-time ticks before the first step).
        if (new URLSearchParams(window.location.search).has('manual')) driver.pause();
        hook.scene = ARENA_SCENE;
        hook.arena = {
          get tick() {
            return view.tick;
          },
          hash: () => hash(world.state),
          characters: () => {
            const s = world.state;
            const out: ProbeCharacter[] = [];
            for (let i = 0; i < MAX_ENTITIES; i++) {
              const f = s.flags[i] ?? 0;
              if (s.kind[i] !== EntityKind.character || (f & EntityFlag.alive) === 0 || (f & EntityFlag.benched) !== 0) continue;
              out.push({ id: i, team: s.team[i] ?? 0, x: s.x[i] ?? 0, y: s.y[i] ?? 0 });
            }
            return out;
          },
          step: (n, cmds = [0, 0]) => {
            driver.pause();
            for (let k = 0; k < n; k++) step(world, cmds);
          },
        };
      }
    }
    const hudData: HudData = { view: this.view };
    this.scene.launch(HUD_SCENE, hudData);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(HUD_SCENE);
      this.onShutdown();
    });
  }

  override update(): void {
    const { driver, view, pool } = this;
    if (!driver || !view || !pool) return;
    const alpha = driver.frame();
    const tick = view.tick;
    pool.begin();
    view.forEachCharacter((c: RenderCharacter) => {
      pool.acquire(c.id).apply(c, tick, alpha);
    });
    pool.end();
  }

  private onShutdown(): void {
    this.events.removeAllListeners(Phaser.Scenes.Events.SHUTDOWN);
    this.pool?.forEachView((v) => {
      v.destroy();
    });
    this.pool?.clear();
    this.pool = undefined;
    this.driver = undefined;
    this.view = undefined;
  }
}
