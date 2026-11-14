import { SetupHandshake, helloOf, type ControlPipe, type MatchSetup, type SessionStatus, type SetupPhase } from '@core/index';
import { el } from '@ui/dom';
import { focusHeading } from '@ui/keyboard';
import type { Screen } from '@ui/screens/screen';
import { loadSave } from '@ui/screens/settings';
import { hostPeer, joinPeer, type Peer } from '../net/peer';
import { ControlMux } from '../net/control-mux';
import { buildDesyncReport } from '../net/desync-report';
import { downloadReport } from './download';
import { linkLine, medianRtt, RTT_WINDOW } from '../net/link-quality';
import { iceFromSettings } from '../net/ice';
import { cleanRoomCode, hostRoom, joinRoom, relayUrl } from '../net/relay';
import { copyText, joinParam, pasteInto, shareBlock } from './online-share';
import { destroyGame, type GameHandle } from './game-handle';
import { ARCADE_RACES, DEFAULT_PICK, partner2For, partnerFor } from './arcade-pick';
import { decodePick, encodePick, onlineSetup, type OnlinePick } from './online-pick';
import { raceLabel } from '@ui/screens/arcade-versus';
import type { ArenaLaunch } from '../scenes/launch';
import { touchStick } from './touch-stick';
import { inVisualOrder, isMeleeRace, touchButtons, watchTouch } from './touch-controls';
import { getUiFlags } from '../platform/flags';

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

/** A rematch gives up waiting for the friend's hero pick after this long. */
export const REMATCH_WAIT_MS = 60_000;

const devBuild = (): boolean => import.meta.env.DEV || import.meta.env.MODE === 'test';

/** `?ice=none` (dev and test builds only): no STUN server, so the offer and answer hold loopback host candidates only (hermetic e2e, no internet). */
function iceParam(): RTCIceServer[] {
  if (devBuild() && new URLSearchParams(window.location.search).get('ice') === 'none') return [];
  return iceFromSettings(loadSave().turnServer);
}

/** Control-channel pump period and the pump count between pings (one ping a second). */
const PUMP_MS = 25;
const PINGS_EVERY_PUMPS = 40;
type SessionStatsSource = { readonly stats: { readonly updates: number; readonly stalls: number } };

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
  let mux: ControlMux | undefined;
  /** The control channel as the screen reads it (through the mux once the link is being watched). */
  const pipeOf = (p: Peer): ControlPipe => mux?.pipe ?? p.control;
  let muxTimer: ReturnType<typeof setInterval> | undefined;
  /** The running match's session, for the link line's stall share. */
  let liveSession: SessionStatsSource | undefined;
  let linkNode: HTMLElement | undefined;
  /** The setup form (codes, steps): collapsed once the link is open. */
  let setupNode: HTMLElement | undefined;
  let introNode: HTMLElement | undefined;
  const rtts: number[] = [];
  let onPageHide: (() => void) | undefined;
  /** Set once the friend left or the link died: later status words must not overwrite that. */
  let ended = false;
  /** The relay room this screen holds open while signalling (WP 10), closed once the link is made or the screen goes. */
  let room: { close: () => void } | undefined;

  const stop = (): void => {
    gone = true;
    room?.close();
    room = undefined;
    if (onPageHide) window.removeEventListener('pagehide', onPageHide);
    onPageHide = undefined;
    mux?.sendBye();
    if (muxTimer !== undefined) clearInterval(muxTimer);
    muxTimer = undefined;
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
      ended = false;
      node = el('div', 'menuPage');
      const status = el('p');
      status.id = 'onlineStatus';
      status.setAttribute('role', 'status');
      const say = (s: string): void => {
        if (!ended) status.textContent = s;
      };
      /** The match or the link is over for good: say why, stop the pick/handshake waits, drop Leave, Rematch and the hero pickers, take the game down. */
      const finish = (words: string): void => {
        if (ended) return;
        ended = true;
        status.textContent = words;
        if (timer !== undefined) clearInterval(timer);
        timer = undefined;
        for (const id of ['onlineLeave', 'onlineAgain', 'onlineReady', 'onlineTeam']) node?.querySelector(`#${id}`)?.remove();
        destroyGame(game, arenaNode);
        game = undefined;
        arenaNode = undefined;
      };
      node.append(el('h1', 'heading', 'Online'));
      const intro = el('p', undefined, 'Play a friend over the internet with no server: one of you hosts and sends a code, the other joins and sends a code back.');
      node.append(intro);
      introNode = intro;

      const startMatch = (p: Peer, say: (s: string) => void, setup: MatchSetup): void => {
        // `?ff=netbot` (dev and test builds only): the Arcade scripted AI plays our side, so a two-context e2e needs no keys.
        liveSession = undefined;
        node?.querySelector('#onlineReport')?.remove();
        const bot = devBuild() && getUiFlags(window.location.search).netbot ? import('./arcade-setup').then((m) => m.arcadeBot(setup, side)) : Promise.resolve(undefined);
        void Promise.all([import('../boot/phaser-config'), bot]).then(([{ createGame }, agent]) => {
          if (gone || !node) return;
          // The previous match's arena stayed up after its end (it keeps answering the friend's session, see onEnd): its end is now certain.
          destroyGame(game, arenaNode);
          game = undefined;
          arenaNode = undefined;
          // The match is on: the hero pickers are done with (a rematch builds them again), so the arena sits high on the page.
          node.querySelector('#onlineTeam')?.remove();
          node.querySelector('#onlineReady')?.remove();
          const holder = el('div');
          holder.id = 'game';
          arenaNode = holder;
          node.append(holder);
          // Touch buttons and the stick for our own side (the same overlays as local Versus; CSS shows them on touch devices only).
          const mine = side === 0 ? setup.p1 : setup.p2;
          const buttons = touchButtons(mine.length >= 3 ? 3 : mine.length === 2 ? 2 : 1, mine.map((m) => isMeleeRace(m.character)));
          const launch: ArenaLaunch = {
            setup,
            arcadeView: (_arena, v) => { watchTouch(buttons, v); },
            onEnd: (end) => {
              if (gone || ended) return;
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
              ...(agent === undefined ? {} : { agent }),
              onStatus: (st, session) => {
                liveSession = session;
                const t = netStatusText(st, session.forfeitReason);
                if (t !== undefined) say(t);
                if (st === 'desync' && !node?.querySelector('#onlineReport')) {
                  const save = button('onlineReport', 'Save report', () => { downloadReport(buildDesyncReport(setup, session)); });
                  node?.insertBefore(save, status);
                }
              },
            },
          };
          game = createGame(holder, launch);
          holder.append(...inVisualOrder(buttons), touchStick());
        });
      };
      const handshake = (p: Peer, setup: MatchSetup): void => {
        const hs = new SetupHandshake(pipeOf(p),helloOf(setup));
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
          pipeOf(p).send(encodePick(mine));
          say('Waiting for your friend to pick...');
          const rematch = matchNo > 0;
          const since = Date.now();
          timer = setInterval(() => {
            const m = pipeOf(p).receive();
            if (m === undefined) {
              if (rematch && Date.now() - since >= REMATCH_WAIT_MS) {
                if (timer !== undefined) clearInterval(timer);
                timer = undefined;
                say('Your friend did not answer the rematch within a minute. Press Back to leave.');
              }
              return;
            }
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
        const m = new ControlMux(p.control, () => {
          if (!gone) finish('Your friend left the match. If a match was running, you win. Press Back to leave.');
        });
        mux = m;
        say('Waiting for the link to open...');
        p.open.then(
          () => {
            if (gone) return;
            // Short pump interval: a pong is timed when it is read, so the readout is at most this much too high.
            let pumps = 0;
            muxTimer = setInterval(() => {
              m.pump();
              if (++pumps % PINGS_EVERY_PUMPS !== 0) return;
              m.sendPing();
              if (m.rttMs !== undefined) {
                rtts.push(m.rttMs);
                if (rtts.length > RTT_WINDOW) rtts.shift();
              }
              if (linkNode) linkNode.textContent = linkLine(medianRtt(rtts), liveSession?.stats);
            }, PUMP_MS);
            rtts.length = 0;
            if (setupNode) setupNode.hidden = true;
            if (introNode) introNode.hidden = true;
            linkNode = el('p', 'onlineChip');
            linkNode.id = 'onlineLink';
            linkNode.textContent = linkLine(undefined);
            node?.insertBefore(linkNode, status);
            onPageHide = () => { m.sendBye(); };
            window.addEventListener('pagehide', onPageHide);
            p.onState((s) => {
              if (gone) return;
              if (s === 'failed' || s === 'closed') finish('The link to your friend was lost, so the match is over. Press Back to leave.');
              else if (s === 'disconnected') say('Your connection to your friend is unstable. Waiting for it to come back...');
            });
            const leave = button('onlineLeave', 'Leave', () => {
              finish('You left the match.');
              stop();
              window.location.hash = '#main';
            });
            node?.insertBefore(leave, status);
            say('Link open. Choose your three heroes, then press Ready.');
            pickPhase(p);
          },
          (e: unknown) => {
            if (!gone) say(e instanceof Error && e.message !== '' ? e.message : 'The connection failed. Check both codes and try again.');
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

      const shareSlot = el('div');
      const host = button('onlineHost', 'Make a code (host)', () => {
        say('Making a code...');
        hostPeer(iceParam()).then(({ peer: p, offer }) => {
          if (gone) { p.close(); return; }
          peer?.close();
          offerOut.box.value = offer;
          shareSlot.replaceChildren(shareBlock(offer, offerOut.box, say));
          peer = p;
          side = 0;
          say('Step 1 done: send your code or link to your friend. Then paste their answer below and press Connect.');
        }, fail);
      });
      const pasteAnswer = button('onlinePasteAnswer', 'Paste answer', () => {
        void pasteInto(answerIn.box).then((ok) => { say(ok ? 'Answer pasted. Now press Connect.' : 'Could not read the clipboard: paste into the box yourself.'); });
      });
      const pasteOffer = button('onlinePasteOffer', 'Paste host code', () => {
        void pasteInto(offerIn.box).then((ok) => { say(ok ? 'Host code pasted. Now press Join a match.' : 'Could not read the clipboard: paste into the box yourself.'); });
      });
      const copyAnswer = button('onlineCopyAnswer', 'Copy answer', () => {
        void copyText(answerOut.box.value, answerOut.box).then((ok) => {
          say(ok ? 'Answer copied. Send it back to your host.' : 'Could not copy automatically: the answer is selected, press Ctrl+C.');
        });
      });
      const connect = button('onlineConnect', 'Connect', () => {
        if (!peer) { say('Press Host a match first.'); return; }
        const p = peer;
        p.accept(answerIn.box.value).then(() => { watch(p); }, fail);
      });
      const join = button('onlineJoin', 'Join a match', () => {
        say('Making an answer...');
        joinPeer(offerIn.box.value, iceParam()).then(({ peer: p, answer }) => {
          if (gone) { p.close(); return; }
          peer?.close();
          answerOut.box.value = answer;
          side = 1;
          watch(p);
          say('Answer ready: copy it and send it back to your host. Waiting for the link to open...');
        }, fail);
      });

      const signal = relayUrl(window.location.search, devBuild());
      if (signal !== undefined) {
        // Optional relay (WP 10): a 6-character room code instead of the long codes. Only the two signalling codes pass through it.
        const roomCode = el('p');
        roomCode.id = 'onlineRoomCode';
        const roomHost = button('onlineRoomHost', 'Host with a room code', () => {
          say('Making a room...');
          room?.close();
          hostPeer(iceParam()).then(({ peer: p, offer }) => {
            if (gone) { p.close(); return; }
            return hostRoom(signal, offer).then((r) => {
              if (gone) { r.close(); p.close(); return; }
              peer?.close();
              peer = p;
              side = 0;
              room = r;
              roomCode.textContent = `Room code: ${r.code}`;
              say(`Room ${r.code} is open for 10 minutes. Tell your friend the code; the match starts when they join.`);
              return r.answer.then((answer) => { r.close(); room = undefined; return p.accept(answer); }).then(() => { watch(p); });
            });
          }).catch(fail);
        });
        const roomIn = el('input');
        roomIn.id = 'onlineRoomIn';
        roomIn.maxLength = 8;
        roomIn.autocomplete = 'off';
        roomIn.spellcheck = false;
        roomIn.setAttribute('aria-label', 'Room code from your friend');
        const roomJoinBtn = button('onlineRoomJoin', 'Join with a room code', () => {
          const code = cleanRoomCode(roomIn.value);
          if (code === undefined) { say('A room code is 6 letters and digits, for example K7P2QM.'); return; }
          say('Joining the room...');
          room?.close();
          joinRoom(signal, code).then((r) => {
            if (gone) { r.close(); return; }
            room = r;
            return joinPeer(r.offer, iceParam()).then(({ peer: p, answer }) => {
              if (gone) { p.close(); return; }
              peer?.close();
              peer = p;
              side = 1;
              r.reply(answer);
              watch(p);
              say('Joined the room. Waiting for the link to open...');
            });
          }).catch(fail);
        });
        const joinRow = el('div', 'settingsOption');
        const joinLab = el('label', undefined, 'Room code (join)');
        joinLab.htmlFor = roomIn.id;
        joinRow.append(joinLab, ' ', roomIn);
        node.append(el('h2', undefined, 'Room code (no copy and paste)'), roomHost, roomCode, joinRow, roomJoinBtn);
      }

      const step = (n: number, text: string): HTMLElement => el('h3', undefined, `Step ${String(n)}: ${text}`);
      node.append(
        el('h2', undefined, 'Host: you start the match'),
        step(1, 'make a code and send it (or the link, or the QR) to your friend'),
        host,
        offerOut.row,
        shareSlot,
        step(2, 'paste your friend\'s answer code'),
        answerIn.row,
        pasteAnswer,
        step(3, 'connect'),
        connect,
      );
      node.append(
        el('h2', undefined, 'Join: your friend started the match'),
        step(1, 'paste the host\'s code (opening the host\'s link does this for you)'),
        offerIn.row,
        pasteOffer,
        step(2, 'join'),
        join,
        step(3, 'send the answer code back to your host'),
        answerOut.row,
        copyAnswer,
        status,
      );
      // One card for the whole setup form, so it can collapse once connected; the status line stays outside it.
      const setup = el('div', 'onlineSetup');
      setup.id = 'onlineSetup';
      setup.append(...Array.from(node.children).filter((c) => c !== status && c.tagName !== 'H1' && c !== intro));
      node.insertBefore(setup, status);
      setupNode = setup;
      const linked = joinParam(window.location.search);
      if (linked !== undefined) {
        // Opened from a join link: fill the host's code, drop it from the address bar and start Join at once.
        offerIn.box.value = linked;
        const url = new URL(window.location.href);
        url.searchParams.delete('join');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        queueMicrotask(() => { if (!gone) join.click(); });
      }
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
