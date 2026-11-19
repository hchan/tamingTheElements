import type Phaser from 'phaser';
import { benchRows, type ArenaCheat, type RenderView, type SimWorld } from '@core/index';
import { Announcer, MATCH_START, createLiveRegion } from '../a11y/announcer';
import { createPauseDialog, type PauseDialog } from '../a11y/pause-dialog';
import { groupSlots, wantsGroupedBar } from '../hud/bar-groups';
import { ActionBarView } from '../hud/action-bar-view';
import { labelsFromBindings, shortLabels, type KeyLabels } from '../hud/action-bar';
import { screenBox } from '../hud/screen-box';
import { firstPad, nthPad } from '../input/gamepad';
import { KeyboardAgent } from '../input/keyboard-agent';
import { P2_BINDINGS } from '../input/local-two';
import { getBindings, type Bindings } from '../platform/input/bindings';
import { counted } from '../platform/test-hook';
import type { SwapFeedback } from './swap-feedback';
import type { ArenaLaunch } from './launch';

/** Legacy cheat keys (key-map CheatAction) to the tester cheats. */
const CHEAT_KEYS = { cheatQ: 'win', cheatX: 'freezeEnemy', cheatC: 'captureWin' } as const satisfies Record<string, ArenaCheat>;

/** What the local input reads from its scene; getters for things created after the scene. */
export interface ArenaInputContext {
  readonly scene: Phaser.Scene;
  readonly launch: ArenaLaunch;
  readonly world: SimWorld;
  readonly view: RenderView;
  readonly arcade: boolean;
  /** An online match: no Escape pause, no button (a shared match cannot be paused by one side). */
  readonly online: boolean;
  readonly swapNotice: () => SwapFeedback | undefined;
  readonly audio: () => { audio: { handleInputEffect(e: { kind: 'toggleMute' }): void } } | undefined;
  readonly togglePause: () => void;
  readonly cheat: (c: ArenaCheat) => void;
  /** The action bar's clicks (the probe reads them). */
  readonly clicks: number[];
  /** Teardown callbacks, pushed in the order the pieces were mounted. */
  readonly cleanups: (() => void)[];
}

export interface ArenaInput {
  readonly keyboard: KeyboardAgent;
  readonly second: KeyboardAgent | undefined;
  readonly actionBar: ActionBarView;
  readonly actionBar2: ActionBarView | undefined;
  readonly pauseDialog: PauseDialog;
  readonly announcer: Announcer;
}

/** Live (not replay) play: Player 1's keyboard and pad, Player 2 in local two-player, the action bars, pause dialog and announcer. */
export function mountArenaInput(ctx: ArenaInputContext): ArenaInput {
  const { scene, launch, world, view, arcade, cleanups } = ctx;
  const keyboard = new KeyboardAgent({
    capturable: () => true,
    bindings: getBindings(),
    gamepad: () => firstPad(typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : null),
    // Legacy Shift-Q / X / C cheats exist only in tester mode (docs/TESTER-MODE.md).
    cheatsEnabled: launch.tester !== undefined,
    arcade,
    tabRun: true, // bare Tab on the page or canvas is Run (Player 1 only; docs/ACCESSIBILITY.md)
    // A swap sent on a tick where the game clock stood still (hit-stop, KO slow motion) is sent again on the next one.
    clock: () => view.actionBar(0)?.tick ?? 0,
    onSwap: (swaps) => { ctx.swapNotice()?.noteSwap(swaps); },
    onAction: (bits) => { ctx.swapNotice()?.noteAction(bits); },
    onEffect: (e) => {
      if (e === 'pause') ctx.togglePause();
      else if (e === 'mute') ctx.audio()?.audio.handleInputEffect({ kind: 'toggleMute' });
      else ctx.cheat(CHEAT_KEYS[e]);
    },
  });
  const tester = launch.tester;
  const pauseDialog = createPauseDialog({
    onResume: () => { ctx.togglePause(); },
    // A shared online match cannot be paused by one side: no Escape pause, no button.
    ...(ctx.online ? {} : { onPause: () => { ctx.togglePause(); } }),
    ...(launch.onRestart ? { onRestart: launch.onRestart } : {}),
    ...(tester ? { onTester: tester.openPanel } : {}),
  });
  if (tester) {
    cleanups.push(
      tester.session.attachArena({ cheat: (c) => { ctx.cheat(c); }, bench: () => benchRows(world, 0), arcade: world.state.arcade.length > 0 }),
    );
  }
  const live = createLiveRegion();
  const announcer = new Announcer((text, assertive) => { live.speak(text, assertive); }, () => performance.now());
  cleanups.push(() => { pauseDialog.destroy(); live.destroy(); });
  announcer.say(MATCH_START);
  let second: KeyboardAgent | undefined;
  if (launch.local2) {
    // Player 2: its own keys and the second pad; pause, mute and cheats stay Player 1's (no onEffect, cheats off).
    second = new KeyboardAgent({
      capturable: () => true,
      bindings: P2_BINDINGS,
      gamepad: () => nthPad(typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : null, 1),
      cheatsEnabled: false,
      arcade,
    });
    cleanups.push(second.attach(counted(window)));
  }
  let labelled: { bindings: Bindings; labels: KeyLabels } | undefined;
  const labels = (): KeyLabels => {
    const b = keyboard.currentBindings();
    if (labelled?.bindings !== b) labelled = { bindings: b, labels: labelsFromBindings(b) };
    return labelled.labels;
  };
  const actionBar = new ActionBarView(
    scene,
    view,
    (cmd) => {
      ctx.clicks.push(cmd);
      keyboard.press(cmd);
    },
    0,
    labels,
    true,
    arcade ? () => screenBox(scene) : undefined,
    false,
    wantsGroupedBar(window.location.search, import.meta.env.DEV || import.meta.env.MODE === 'test') ? groupSlots : undefined,
  );
  let actionBar2: ActionBarView | undefined;
  if (second) {
    const p2Labels = shortLabels(labelsFromBindings(P2_BINDINGS));
    actionBar2 = new ActionBarView(scene, view, () => undefined, 1, () => p2Labels, true, arcade ? () => screenBox(scene) : undefined, true);
  }
  cleanups.push(keyboard.attach(counted(window)));
  return { keyboard, second, actionBar, actionBar2, pauseDialog, announcer };
}
