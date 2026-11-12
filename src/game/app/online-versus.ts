import { SetupHandshake, helloOf, type MatchSetup, type SessionStatus, type SetupPhase } from '@core/index';
import { el } from '@ui/dom';
import { focusHeading } from '@ui/keyboard';
import type { Screen } from '@ui/screens/screen';
import { hostPeer, joinPeer, type Peer } from '../net/peer';
import { destroyGame, type GameHandle } from './game-handle';
import { ARCADE_RACES, DEFAULT_PICK, partner2For, partnerFor } from './arcade-pick';
import { decodePick, encodePick, onlineSetup, type OnlinePick } from './online-pick';
import { raceLabel } from '@ui/screens/arcade-versus';
import type { ArenaLaunch } from '../scenes/launch';

/**
 * The `#online` route (preview, shown with Arcade Versus), its own chunk. Two players connect with copy-pasted codes (no
 * server): the host makes an offer code, the friend pastes it and sends an answer code back. Once the link is open both
 * sides pick three heroes, swap picks (the host's seed decides the match), then run the setup handshake and play in lockstep.
 */

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

/** Words for a finished match from `side`'s point of view: never colour alone. */
export function endText(winner: number, side: 0 | 1, rounds: readonly [number, number] | undefined): string {
  const verdict = winner < 0 ? 'The match was a draw.' : winner === side ? 'You won the match!' : 'Your friend won the match.';
  if (rounds === undefined) return verdict;
  const mine = rounds[side];
  const theirs = rounds[side === 0 ? 1 : 0];
  return `${verdict} Rounds ${String(mine)}-${String(theirs)}.`;
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

/** `?matchticks=N` (dev and test builds only): end the match as a draw at tick N. */
function matchTicksParam(): number | undefined {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test')) return undefined;
  const n = Number(new URLSearchParams(window.location.search).get('matchticks'));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function onlineVersusScreen(): Screen {
  const matchTicks = matchTicksParam();
  let node: HTMLElement | null = null;
  let peer: Peer | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let gone = false;
  let side: 0 | 1 = 0;
  /** Match number on this link; a rematch bumps it so late packets of the finished match are dropped. */
  let matchNo = 0;
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

  const screen: Screen = {
    mount(container) {
      gone = false;
      node = el('div', 'menuPage');
      const status = el('p');
      status.id = 'onlineStatus';
      status.setAttribute('role', 'status');
      const say = (s: string): void => {
        status.textContent = s;
      };
      node.append(el('h1', 'heading', 'Online'));
      node.append(
        el('p', undefined, 'Play a friend over the internet with no server: one of you hosts and sends a code, the other joins and sends a code back.'),
      );

      const startMatch = (p: Peer, say: (s: string) => void, setup: MatchSetup): void => {
        void import('../boot/phaser-config').then(({ createGame }) => {
          if (gone || !node) return;
          // The previous match's arena stayed up after its end (it keeps answering the friend's session, see onEnd): its end is now certain.
          destroyGame(game, arenaNode);
          game = undefined;
          arenaNode = undefined;
          const holder = el('div');
          holder.id = 'game';
          arenaNode = holder;
          node.append(holder);
          const launch: ArenaLaunch = {
            setup,
            onEnd: (end) => {
              if (gone) return;
              say(endText(end.winner, side, end.rounds));
              // The finished arena stays up (its sim paused, its session still answering) until the next match starts or the screen
              // closes: the datagram link is lossy, and a side gone silent at its own end can strand a friend who is one input short.
              const again = button('onlineAgain', 'Rematch', () => {
                again.remove();
                matchNo = (matchNo + 1) & 0xff;
                say('Rematch: choose your three heroes, then press Ready.');
                pickPhase(p);
              });
              node?.insertBefore(again, status);
              again.focus();
            },
            net: {
              side,
              match: matchNo,
              ...(matchTicks === undefined ? {} : { tickLimit: matchTicks }),
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
      const handshake = (p: Peer, setup: MatchSetup): void => {
        const hs = new SetupHandshake(p.control, helloOf(setup));
        timer = setInterval(() => {
          const phase = hs.poll();
          say(phaseText(phase, hs.reason));
          if ((phase === 'go' || phase === 'rejected') && timer !== undefined) {
            clearInterval(timer);
            timer = undefined;
            if (phase === 'go') startMatch(p, say, setup);
          }
        }, 50);
      };
      /** Hero choice: send ours, wait for theirs (one message only, so the handshake's HELLO stays queued; also the rematch entry), then both derive the setup. */
      const pickPhase = (p: Peer): void => {
        node?.querySelector('#onlineReady')?.remove();
        node?.querySelector('#onlineTeam')?.remove();
        // Three heroes a side (WP-pvp-3heroes): a 1v1 duel of two teams; ids onlineRace (lead), onlineRace2, onlineRace3.
        const team = el('div');
        team.id = 'onlineTeam';
        const sels = ['Your hero 1', 'Your hero 2', 'Your hero 3'].map((text, i) => {
          const row = el('div', 'settingsOption');
          const lab = el('label', undefined, text);
          const sel = el('select');
          sel.id = i === 0 ? 'onlineRace' : `onlineRace${String(i + 1)}`;
          lab.htmlFor = sel.id;
          for (const r of ARCADE_RACES) {
            const o = el('option', undefined, raceLabel(r));
            o.value = r;
            sel.append(o);
          }
          sel.value = [DEFAULT_PICK.player, 'pax', 'curomo'][i] ?? DEFAULT_PICK.player;
          row.append(lab, ' ', sel);
          team.append(row);
          return sel;
        });
        const ready = button('onlineReady', 'Ready', () => {
          ready.disabled = true;
          for (const s of sels) s.disabled = true;
          const race = ARCADE_RACES.find((r) => r === sels[0]?.value) ?? DEFAULT_PICK.player;
          const second = partnerFor(race, sels[1]?.value);
          const bench = [second, partner2For(race, second, sels[2]?.value)];
          const mine: OnlinePick = { race, bench, seed: side === 0 ? crypto.getRandomValues(new Uint32Array(1))[0] ?? 1 : 0 };
          p.control.send(encodePick(mine));
          say('Waiting for your friend to pick...');
          timer = setInterval(() => {
            const m = p.control.receive();
            if (m === undefined) return;
            if (timer !== undefined) clearInterval(timer);
            timer = undefined;
            const theirs = decodePick(m);
            if (theirs === undefined) {
              say('Your friend sent something unexpected. Both reload the page.');
              return;
            }
            handshake(p, side === 0 ? onlineSetup(mine, theirs) : onlineSetup(theirs, mine));
          }, 50);
        });
        node?.insertBefore(team, status);
        node?.insertBefore(ready, status);
        sels[0]?.focus();
      };
      const watch = (p: Peer): void => {
        peer = p;
        say('Waiting for the link to open...');
        p.open.then(
          () => {
            if (gone) return;
            say('Link open. Choose your three heroes, then press Ready.');
            pickPhase(p);
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
  return screen;
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
