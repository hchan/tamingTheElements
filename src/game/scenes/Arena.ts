import Phaser from 'phaser';
import {
  DEFAULT_SIM_FLAGS,
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
import { FixedStepDriver } from '../loop/fixed-step-driver';
import { CharacterView } from '../views/character-view';
import { EntityViewPool } from '../views/entity-view-pool';

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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
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
