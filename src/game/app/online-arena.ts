import type { MatchSetup, Transport } from '@core/index';
import { el } from '@ui/dom';
import type { GameHandle } from './game-handle';
import type { ArenaLaunch } from '../scenes/launch';
import { inVisualOrder, isMeleeRace, touchButtons, watchTouch } from './touch-controls';
import { getUiFlags } from '../platform/flags';
import { getPrefs } from '../platform/a11y/prefs';
import { mountArenaPan } from '../fx/arena-pan';
import { mountAimIndicator } from '../fx/aim-view';

/**
 * Starts the arena of an online quick match inside `node` (it began as a copy of the launch block of the retired peer-to-peer screen): dev hooks (`?ff=netbot`, `?netsim=`, `?matchticks=`), touch overlays, the panning view and the
 * session timing the service announced. The caller destroys the game with `destroyGame(game, holder)`.
 */
const devBuild = (): boolean => import.meta.env.DEV || import.meta.env.MODE === 'test';

/** `?matchticks=N` (dev and test builds only): end the match as a draw at tick N. */
function matchTicksParam(): number | undefined {
  if (!devBuild()) return undefined;
  const n = Number(new URLSearchParams(window.location.search).get('matchticks'));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

type Net = NonNullable<ArenaLaunch['net']>;

export interface OnlineArenaOptions {
  readonly node: HTMLElement;
  readonly setup: MatchSetup;
  readonly side: 0 | 1;
  readonly match: number;
  readonly input: Transport;
  readonly inputDelay?: number;
  readonly batchEvery?: number;
  readonly onEnd: NonNullable<ArenaLaunch['onEnd']>;
  readonly onStatus: NonNullable<Net['onStatus']>;
}

export interface OnlineArena {
  readonly game: GameHandle;
  readonly holder: HTMLElement;
}

export async function launchOnlineArena(o: OnlineArenaOptions): Promise<OnlineArena> {
  const { setup, side } = o;
  const matchTicks = matchTicksParam();
  const sim = devBuild() && new URLSearchParams(window.location.search).has('netsim') ? import('../net/netsim') : Promise.resolve(undefined);
  const bot = devBuild() && getUiFlags(window.location.search).netbot ? import('./arcade-setup').then((m) => m.arcadeBot(setup, side)) : Promise.resolve(undefined);
  const [{ createGame }, agent, netsimMod] = await Promise.all([import('../boot/phaser-config'), bot, sim]);
  const netsim = netsimMod?.netsimFromSearch(window.location.search, true);
  const holder = el('div');
  holder.id = 'game';
  o.node.append(holder);
  o.node.classList.add('onlineLive');
  const mine = side === 0 ? setup.p1 : setup.p2;
  const buttons = touchButtons(mine.length >= 3 ? 3 : mine.length === 2 ? 2 : 1, mine.map((m) => isMeleeRace(m.character)));
  const launch: ArenaLaunch = {
    setup,
    arcadeView: (arena, v, alpha) => {
      watchTouch(buttons, v);
      mountAimIndicator(arena, v, alpha);
      mountArenaPan(arena, v, alpha, () => getPrefs().reduceMotion, alpha);
    },
    onEnd: o.onEnd,
    net: {
      side,
      match: o.match,
      ...(o.inputDelay === undefined ? {} : { inputDelay: o.inputDelay }),
      ...(o.batchEvery === undefined ? {} : { batchEvery: o.batchEvery }),
      ...(matchTicks === undefined ? {} : { tickLimit: matchTicks }),
      input: netsim === undefined || netsimMod === undefined ? o.input : new netsimMod.NetsimTransport(o.input, netsim),
      ...(agent === undefined ? {} : { agent }),
      onStatus: o.onStatus,
    },
  };
  const game = createGame(holder, launch);
  holder.append(...inVisualOrder(buttons));
  return { game, holder };
}
