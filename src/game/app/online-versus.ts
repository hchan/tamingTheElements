import { SetupHandshake, helloOf, type SessionStatus, type SetupPhase } from '@core/index';
import { el } from '@ui/dom';
import { focusHeading } from '@ui/keyboard';
import type { Screen } from '@ui/screens/screen';
import { hostPeer, joinPeer, type Peer } from '../net/peer';
import { destroyGame, type GameHandle } from './game-handle';
import { DEFAULT_PICK } from './arcade-pick';
import { arcadeSetup } from './arcade-setup';
import type { ArenaLaunch } from '../scenes/launch';

/**
 * The `#online` route (preview, shown with Arcade Versus), its own chunk. Two players connect with copy-pasted codes (no
 * server): the host makes an offer code, the friend pastes it and sends an answer code back. Once the link is open both
 * sides run the setup handshake (sim version, flags, rosters) as a connection check. Playing the match over the link is the
 * next work package (docs/NETCODE.md), so this screen stops at "Connected".
 */

/** Fixed setup for the connection check: both builds must derive the same one, or the handshake says why not. */
const CHECK_SEED = 1;

/** Words for the status line: never colour alone. */
export function phaseText(phase: SetupPhase, reason: string | undefined): string {
  if (phase === 'go') return 'Connected. Both games are the same version and settings.';
  if (phase === 'rejected') {
    return reason === 'simVersion'
      ? 'Connected, but your friend runs a different version of the game. Both reload the page.'
      : `Connected, but the games do not match (${reason ?? 'unknown'}).`;
  }
  return 'Link open. Checking that both games match...';
}

/** Words for a stopped match: never colour alone. */
export function netStatusText(status: SessionStatus, reason: string | undefined): string | undefined {
  if (status === 'desync') return 'The two games disagree about the match, so it was stopped. Please play again.';
  if (status === 'forfeit') return reason === 'timeout' ? 'Your friend stopped responding, so you win.' : 'The match ended: a player left.';
  if (status === 'remote-paused') return 'Your friend switched tabs; waiting for them.';
  return undefined;
}

function area(id: string, label: string, readOnly: boolean): { row: HTMLElement; box: HTMLTextAreaElement } {
  const row = el('div', 'settingsOption');
  const lab = el('label', undefined, label);
  lab.htmlFor = id;
  const box = el('textarea');
  box.id = id;
  box.rows = 3;
  box.cols = 40;
  box.readOnly = readOnly;
  box.spellcheck = false;
  row.append(lab, el('br'), box);
  return { row, box };
}

function button(id: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'menuButton', label);
  b.type = 'button';
  b.id = id;
  b.addEventListener('click', onClick);
  return b;
}

export function onlineVersusScreen(): Screen {
  let node: HTMLElement | null = null;
  let peer: Peer | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let gone = false;
  let side: 0 | 1 = 0;
  let game: GameHandle | undefined;
  let arenaNode: HTMLElement | undefined;

  const stop = (): void => {
    gone = true;
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    destroyGame(game, arenaNode);
    game = undefined;
    arenaNode = undefined;
    peer?.close();
    peer = undefined;
  };

  return {
    mount(container) {
      gone = false;
      node = el('div', 'menuPage');
      const status = el('p');
      status.id = 'onlineStatus';
      status.setAttribute('role', 'status');
      const say = (s: string): void => {
        status.textContent = s;
      };
      node.append(el('h1', 'heading', 'Online Versus (preview)'));
      node.append(
        el('p', undefined, 'Play a friend over the internet with no server: one of you hosts and sends a code, the other joins and sends a code back.'),
      );

      const startMatch = (p: Peer, say: (s: string) => void): void => {
        void import('../boot/phaser-config').then(({ createGame }) => {
          if (gone || !node) return;
          const holder = el('div');
          holder.id = 'game';
          arenaNode = holder;
          node.append(holder);
          const launch: ArenaLaunch = {
            setup: arcadeSetup(DEFAULT_PICK, CHECK_SEED),
            net: {
              side,
              input: p.input,
              onStatus: (st, session) => {
                const t = netStatusText(st, session.forfeitReason);
                if (t !== undefined) say(t);
              },
            },
          };
          game = createGame(holder, launch);
        });
      };
      const watch = (p: Peer): void => {
        peer = p;
        say('Waiting for the link to open...');
        p.open.then(
          () => {
            if (gone) return;
            const hs = new SetupHandshake(p.control, helloOf(arcadeSetup(DEFAULT_PICK, CHECK_SEED)));
            timer = setInterval(() => {
              const phase = hs.poll();
              say(phaseText(phase, hs.reason));
              if ((phase === 'go' || phase === 'rejected') && timer !== undefined) {
                clearInterval(timer);
                timer = undefined;
                if (phase === 'go') startMatch(p, say);
              }
            }, 50);
          },
          () => {
            if (!gone) say('The connection failed. Check both codes and try again (a strict network may need a relay).');
          },
        );
      };
      const fail = (e: unknown): void => {
        say(e instanceof Error ? e.message : 'Something went wrong.');
      };

      const offerOut = area('onlineOffer', 'Your code to send to your friend (host)', true);
      const answerIn = area('onlineAnswerIn', 'Your friend\'s answer code (host)', false);
      const offerIn = area('onlineOfferIn', 'Your friend\'s host code (join)', false);
      const answerOut = area('onlineAnswer', 'Your answer code to send back (join)', true);

      const host = button('onlineHost', 'Host a match', () => {
        say('Making a code...');
        hostPeer().then(({ peer: p, offer }) => {
          if (gone) { p.close(); return; }
          peer?.close();
          offerOut.box.value = offer;
          peer = p;
          side = 0;
          say('Send your code to your friend, then paste their answer below and press Connect.');
        }, fail);
      });
      const connect = button('onlineConnect', 'Connect', () => {
        if (!peer) { say('Press Host a match first.'); return; }
        const p = peer;
        p.accept(answerIn.box.value).then(() => { watch(p); }, fail);
      });
      const join = button('onlineJoin', 'Join a match', () => {
        say('Making an answer...');
        joinPeer(offerIn.box.value).then(({ peer: p, answer }) => {
          if (gone) { p.close(); return; }
          peer?.close();
          answerOut.box.value = answer;
          side = 1;
          watch(p);
        }, fail);
      });

      node.append(el('h2', undefined, 'Host'), host, offerOut.row, answerIn.row, connect);
      node.append(el('h2', undefined, 'Join'), offerIn.row, join, answerOut.row, status);
      const back = el('a', 'menuLink', 'Back');
      back.setAttribute('href', '#main');
      node.append(back);
      container.append(node);
      focusHeading(node);
    },
    unmount() {
      stop();
      node?.remove();
      node = null;
    },
  };
}

let active: Screen | undefined;

export function mountOnline(container: HTMLElement): void {
  active?.unmount();
  active = onlineVersusScreen();
  active.mount(container);
}

export function unmountOnline(): void {
  active?.unmount();
  active = undefined;
}
