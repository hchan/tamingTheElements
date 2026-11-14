// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupHandshake, characterId, helloOf, type ControlPipe } from '@core/index';
import type { ArenaLaunch } from '../scenes/launch';
import { decodePick, encodePick, onlineSetup, type OnlinePick } from './online-pick';

interface FakePeer {
  open: Promise<void>;
  control: ControlPipe;
  input: object;
  accept: (code: string) => Promise<void>;
  close: () => void;
}

const h = vi.hoisted(() => {
  const state: {
    hostResult: unknown;
    joinResult: unknown;
    hostError: unknown;
    joinError: unknown;
    joinedOffer: string;
    created: Array<{ host: HTMLElement; launch: ArenaLaunch; destroyed: boolean }>;
  } = { hostResult: undefined, joinResult: undefined, hostError: undefined, joinError: undefined, joinedOffer: '', created: [] };
  return state;
});


vi.mock('../net/peer', () => ({
  hostPeer: () =>
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    h.hostError ? Promise.reject(h.hostError) : Promise.resolve(h.hostResult),
  joinPeer: (offer: string) => {
    h.joinedOffer = offer;
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    return h.joinError ? Promise.reject(h.joinError) : Promise.resolve(h.joinResult);
  },
}));
vi.mock('../boot/phaser-config', () => ({
  createGame: (host: HTMLElement, launch: ArenaLaunch) => {
    let once: (() => void) | undefined;
    const g = {
      host,
      launch,
      destroyed: false,
      destroy() {
        g.destroyed = true;
        queueMicrotask(() => once?.());
      },
      events: { once: (_e: string, fn: () => void) => void (once = fn) },
    };
    h.created.push(g);
    return g;
  },
}));

import { mountOnline, onlineVersusScreen, unmountOnline } from './online-versus';

/** Two linked in-memory control pipes: what one sends the other receives. */
function pipes(): { a: ControlPipe; b: ControlPipe } {
  const ab: Uint8Array[] = [];
  const ba: Uint8Array[] = [];
  return {
    a: { send: (m) => void ab.push(m), receive: () => ba.shift() },
    b: { send: (m) => void ba.push(m), receive: () => ab.shift() },
  };
}

interface Rig {
  peer: FakePeer;
  friend: ControlPipe;
  openLink: () => void;
  failLink: () => void;
  closed: () => number;
  accepted: string[];
}

function rig(): Rig {
  const p = pipes();
  let open!: () => void;
  let fail!: () => void;
  const opened = new Promise<void>((res, rej) => {
    open = res;
    fail = () => { rej(new Error('The connection failed. No public address was found.')); };
  });
  let closed = 0;
  const accepted: string[] = [];
  return {
    peer: {
      open: opened,
      control: p.a,
      input: { name: 'input' },
      accept: (c) => {
        accepted.push(c);
        return Promise.resolve();
      },
      close: () => {
        closed++;
      },
    },
    friend: p.b,
    openLink: open,
    failLink: fail,
    closed: () => closed,
    accepted,
  };
}

let host: HTMLElement;
const tick = async (ms = 50): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const e = host.querySelector<T>(`#${id}`);
  if (!e) throw new Error(id);
  return e;
};
const statusText = (): string => $('onlineStatus').textContent;
const click = async (id: string): Promise<void> => {
  $(id).click();
  await tick(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  h.hostError = undefined;
  h.joinError = undefined;
  h.created.length = 0;
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  unmountOnline();
  await tick(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
});

/** Host path up to the hero pickers being shown. */
async function hostToPick(r: Rig): Promise<void> {
  h.hostResult = { peer: r.peer, offer: 'OFFER-CODE' };
  mountOnline(host);
  await click('onlineHost');
  r.openLink();
  await click('onlineConnect');
  await tick(0);
}

describe('online versus share, copy, paste and join link', () => {
  const clip = (text: string): { written: string[] } => {
    const written: string[] = [];
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: (t: string) => { written.push(t); return Promise.resolve(); },
        readText: () => Promise.resolve(text),
      },
    });
    return { written };
  };

  it('numbers the steps for host and join', () => {
    mountOnline(host);
    const steps = [...host.querySelectorAll('h3')].map((e) => e.textContent);
    expect(steps.filter((s) => s.startsWith('Step 1'))).toHaveLength(2);
    expect(steps.filter((s) => s.startsWith('Step 3'))).toHaveLength(2);
  });

  it('after Make a code: Copy code and Copy link write the code and the join link, and a QR is shown', async () => {
    const c = clip('');
    const r = rig();
    h.hostResult = { peer: r.peer, offer: 'T1.ABC_def-123' };
    mountOnline(host);
    await click('onlineHost');
    await click('onlineCopyCode');
    await click('onlineCopyLink');
    expect(c.written[0]).toBe('T1.ABC_def-123');
    expect(c.written[1]).toMatch(/\?join=T1\.ABC_def-123#online$/);
    expect(statusText()).toContain('Link copied');
    expect($('onlineQr').getAttribute('role')).toBe('img');
    expect($('onlineQr').querySelector('svg')).not.toBeNull();
  });

  it('Paste fills the answer box from the clipboard; Copy answer copies the joiner answer', async () => {
    const c = clip('  T1.ANSWER \n');
    const r = rig();
    h.joinResult = { peer: r.peer, answer: 'T1.MYANSWER' };
    mountOnline(host);
    await click('onlinePasteAnswer');
    expect($<HTMLTextAreaElement>('onlineAnswerIn').value).toBe('T1.ANSWER');
    await click('onlinePasteOffer');
    await click('onlineJoin');
    await click('onlineCopyAnswer');
    expect(c.written).toEqual(['T1.MYANSWER']);
  });

  it('a refused clipboard is explained in words', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: () => Promise.reject(new Error('denied')) } });
    mountOnline(host);
    await click('onlinePasteAnswer');
    expect(statusText()).toContain('Could not read the clipboard');
  });

  it('opening a ?join= link fills the host code, starts Join at once and removes the param', async () => {
    const r = rig();
    h.joinResult = { peer: r.peer, answer: 'T1.ANS' };
    window.history.replaceState(null, '', '/?join=T1.HOSTCODE#online');
    mountOnline(host);
    await tick(0);
    expect(h.joinedOffer).toBe('T1.HOSTCODE');
    expect($<HTMLTextAreaElement>('onlineAnswer').value).toBe('T1.ANS');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#online');
  });

  it('ignores a malformed ?join= value', async () => {
    h.joinedOffer = '';
    window.history.replaceState(null, '', '/?join=garbage#online');
    mountOnline(host);
    await tick(0);
    expect(h.joinedOffer).toBe('');
  });
});

describe('online versus screen', () => {
  it('mounts with the host and join controls and a Back link', () => {
    mountOnline(host);
    expect($('onlineHost')).toBeDefined();
    expect($('onlineJoin')).toBeDefined();
    expect($<HTMLTextAreaElement>('onlineOffer').readOnly).toBe(true);
    expect($<HTMLTextAreaElement>('onlineAnswer').readOnly).toBe(true);
    expect($<HTMLTextAreaElement>('onlineAnswerIn').readOnly).toBe(false);
    expect($('onlineStatus').getAttribute('role')).toBe('status');
    expect(host.querySelector('a[href="#main"]')).not.toBeNull();
  });

  it('Connect before Host asks to host first', async () => {
    mountOnline(host);
    await click('onlineConnect');
    expect(statusText()).toBe('Press Host a match first.');
  });

  it('host: shows the offer code and applies the pasted answer', async () => {
    const r = rig();
    h.hostResult = { peer: r.peer, offer: 'OFFER-CODE' };
    mountOnline(host);
    await click('onlineHost');
    expect($<HTMLTextAreaElement>('onlineOffer').value).toBe('OFFER-CODE');
    expect(statusText()).toContain('send your code or link to your friend');
    $<HTMLTextAreaElement>('onlineAnswerIn').value = 'ANSWER';
    await click('onlineConnect');
    expect(r.accepted).toEqual(['ANSWER']);
    expect(statusText()).toContain('Waiting for the link to open...');
    r.openLink();
    await tick(0);
    expect(statusText()).toContain('Link open. Choose your three heroes');
    expect(host.querySelectorAll('#onlineTeam select')).toHaveLength(3);
    expect($<HTMLSelectElement>('onlineRace').value).toBe('sindarosa');
    expect($<HTMLSelectElement>('onlineRace2').value).toBe('pax');
    expect($<HTMLSelectElement>('onlineRace3').value).toBe('curomo');
  });

  it('a second Host press closes the earlier peer', async () => {
    const r1 = rig();
    const r2 = rig();
    h.hostResult = { peer: r1.peer, offer: 'ONE' };
    mountOnline(host);
    await click('onlineHost');
    h.hostResult = { peer: r2.peer, offer: 'TWO' };
    await click('onlineHost');
    expect(r1.closed()).toBe(1);
    expect($<HTMLTextAreaElement>('onlineOffer').value).toBe('TWO');
  });

  it('shows the error text when hosting fails, and a generic one for non-Errors', async () => {
    mountOnline(host);
    h.hostError = new Error('no rtc');
    await click('onlineHost');
    expect(statusText()).toBe('no rtc');
    h.hostError = 'weird';
    await click('onlineHost');
    expect(statusText()).toBe('Something went wrong.');
  });

  it('shows the error when the answer code is bad', async () => {
    const r = rig();
    r.peer.accept = () => Promise.reject(new Error('That is not an answer code.'));
    h.hostResult = { peer: r.peer, offer: 'O' };
    mountOnline(host);
    await click('onlineHost');
    await click('onlineConnect');
    expect(statusText()).toBe('That is not an answer code.');
  });

  it('says so when the link fails to open', async () => {
    const r = rig();
    await hostToPick(r).catch(() => undefined);
    // already open in hostToPick; run a second screen where the link fails instead
    unmountOnline();
    const r2 = rig();
    h.hostResult = { peer: r2.peer, offer: 'O' };
    host.replaceChildren();
    mountOnline(host);
    await click('onlineHost');
    await click('onlineConnect');
    r2.failLink();
    await tick(0);
    expect(statusText()).toContain('The connection failed');
  });

  it('host: picks, exchanges picks, passes the handshake and starts the match', async () => {
    const r = rig();
    await hostToPick(r);
    $<HTMLSelectElement>('onlineRace').value = 'fiara';
    await click('onlineReady');
    expect($<HTMLButtonElement>('onlineReady').disabled).toBe(true);
    expect($<HTMLSelectElement>('onlineRace').disabled).toBe(true);
    expect(statusText()).toBe('Waiting for your friend to pick...');

    const hostMsg = r.friend.receive();
    const hostPick = hostMsg && decodePick(hostMsg);
    expect(hostPick?.race).toBe('fiara');
    if (!hostPick) throw new Error('no pick');
    expect(hostPick.bench).toHaveLength(2);
    expect(hostPick.bench).not.toContain('fiara');
    const friendPick: OnlinePick = { race: characterId('pax'), seed: 0 };
    r.friend.send(encodePick(friendPick));
    await tick();
    await tick();
    expect(statusText()).toBe('Link open. Checking that both games match...');

    const hs = new SetupHandshake(r.friend, helloOf(onlineSetup(hostPick, friendPick)));
    for (let i = 0; i < 4 && h.created.length === 0; i++) {
      hs.poll();
      await tick();
    }
    expect(statusText()).toBe('Connected. Both games are the same version and settings.');
    expect(h.created).toHaveLength(1);
    const launch = h.created[0]?.launch;
    expect(launch?.net?.side).toBe(0);
    expect(launch?.net?.match).toBe(0);
    expect(launch?.net?.tickLimit).toBeUndefined();
    expect(launch?.net?.input).toBe(r.peer.input);
    expect(host.querySelector('#game')).toBe(h.created[0]?.host);

    launch?.net?.onStatus?.('desync', { forfeitReason: undefined } as never);
    expect(statusText()).toContain('disagree');
    launch?.net?.onStatus?.('running', { forfeitReason: undefined } as never);
    expect(statusText()).toContain('disagree');

    // End of match: result text, game torn down, Rematch bumps the match number and returns to the picker.
    launch?.onEnd?.({ winner: 0, activeSlot: 0, capturedIndices: [], rounds: [2, 0] });
    expect(statusText()).toBe('You won the match! Rounds 2-0.');
    // The finished arena lingers (it keeps answering the friend's session) until the rematch's match replaces it.
    expect(h.created[0]?.destroyed).toBe(false);
    await tick(0);
    await click('onlineAgain');
    expect(host.querySelector('#onlineAgain')).toBeNull();
    expect(statusText()).toContain('Rematch: choose your three heroes');
    expect(host.querySelector('#onlineTeam')).not.toBeNull();
    // Rematch pick, then a second match with match number 1.
    while (r.friend.receive()) {
      // drain leftover handshake messages from the first match
    }
    await click('onlineReady');
    const second = r.friend.receive();
    expect(second && decodePick(second)).toBeDefined();
    const again = second && decodePick(second);
    if (!again) throw new Error('no pick');
    r.friend.send(encodePick(friendPick));
    await tick();
    const hs2 = new SetupHandshake(r.friend, helloOf(onlineSetup(again, friendPick)));
    for (let i = 0; i < 4 && h.created.length < 2; i++) {
      hs2.poll();
      await tick();
    }
    expect(h.created).toHaveLength(2);
    expect(h.created[1]?.launch.net?.match).toBe(1);
  });

  it('?matchticks=N is passed as the tick limit (test builds)', async () => {
    window.history.replaceState(null, '', '/?matchticks=250');
    const r = rig();
    await hostToPick(r);
    await click('onlineReady');
    const hostMsg = r.friend.receive();
    const hostPick = hostMsg && decodePick(hostMsg);
    if (!hostPick) throw new Error('no pick');
    const friendPick: OnlinePick = { race: characterId('pax'), seed: 0 };
    r.friend.send(encodePick(friendPick));
    await tick();
    const hs = new SetupHandshake(r.friend, helloOf(onlineSetup(hostPick, friendPick)));
    for (let i = 0; i < 4 && h.created.length === 0; i++) {
      hs.poll();
      await tick();
    }
    expect(h.created[0]?.launch.net?.tickLimit).toBe(250);
  });

  it('rejects an unreadable pick from the friend', async () => {
    const r = rig();
    await hostToPick(r);
    await click('onlineReady');
    r.friend.send(Uint8Array.of(1, 2, 3));
    await tick();
    expect(statusText()).toContain('Your friend sent something unexpected');
  });

  it('reports a handshake rejection and does not start a match', async () => {
    const r = rig();
    await hostToPick(r);
    await click('onlineReady');
    const hostMsg = r.friend.receive();
    const hostPick = hostMsg && decodePick(hostMsg);
    if (!hostPick) throw new Error('no pick');
    r.friend.send(encodePick({ race: characterId('pax'), seed: 0 }));
    await tick();
    r.friend.send(Uint8Array.of(99));
    await tick();
    await tick();
    expect(statusText()).toContain('the games do not match');
    expect(h.created).toHaveLength(0);
  });

  it('join: shows the answer code, takes side 1 and sends no seed', async () => {
    const r = rig();
    h.joinResult = { peer: r.peer, answer: 'ANSWER-CODE' };
    mountOnline(host);
    $<HTMLTextAreaElement>('onlineOfferIn').value = 'THE-OFFER';
    await click('onlineJoin');
    expect(h.joinedOffer).toBe('THE-OFFER');
    expect($<HTMLTextAreaElement>('onlineAnswer').value).toBe('ANSWER-CODE');
    expect(statusText()).toContain('Waiting for the link to open...');
    r.openLink();
    await tick(0);
    await click('onlineReady');
    const mine = r.friend.receive();
    expect(mine && decodePick(mine)?.seed).toBe(0);
    const hostPick: OnlinePick = { race: characterId('sindarosa'), seed: 4321 };
    r.friend.send(encodePick(hostPick));
    await tick();
    const joiner = mine && decodePick(mine);
    if (!joiner) throw new Error('no pick');
    const hs = new SetupHandshake(r.friend, helloOf(onlineSetup(hostPick, joiner)));
    for (let i = 0; i < 4 && h.created.length === 0; i++) {
      hs.poll();
      await tick();
    }
    expect(h.created).toHaveLength(1);
    const launch = h.created[0]?.launch;
    expect(launch?.net?.side).toBe(1);
    launch?.onEnd?.({ winner: 0, activeSlot: 0, capturedIndices: [] });
    expect(statusText()).toBe('Your friend won the match.');
  });

  it('join: shows the error for a bad host code', async () => {
    h.joinError = new Error('That is not an offer code.');
    mountOnline(host);
    await click('onlineJoin');
    expect(statusText()).toBe('That is not an offer code.');
  });

  it('closes a peer that arrives after the screen was unmounted', async () => {
    const r = rig();
    h.hostResult = { peer: r.peer, offer: 'LATE' };
    const screen = onlineVersusScreen();
    screen.mount(host);
    $('onlineHost').click();
    screen.unmount();
    await tick(0);
    expect(r.closed()).toBe(1);
    const r2 = rig();
    h.joinResult = { peer: r2.peer, answer: 'LATE' };
    screen.mount(host);
    $('onlineJoin').click();
    screen.unmount();
    await tick(0);
    expect(r2.closed()).toBe(1);
  });

  it('unmount closes the live peer, stops timers and tears the game down', async () => {
    const r = rig();
    await hostToPick(r);
    await click('onlineReady');
    unmountOnline();
    expect(r.closed()).toBe(1);
    expect(host.querySelector('.menuPage')).toBeNull();
    // The pick poll must not keep running (it would call receive on a closed peer).
    const spy = vi.spyOn(r.peer.control, 'receive');
    await tick(200);
    expect(spy).not.toHaveBeenCalled();
  });

  it('a late link-open or link-failure after unmount does nothing', async () => {
    const r = rig();
    h.hostResult = { peer: r.peer, offer: 'O' };
    mountOnline(host);
    await click('onlineHost');
    await click('onlineConnect');
    unmountOnline();
    r.openLink();
    await tick(0);
    expect(host.querySelector('#onlineTeam')).toBeNull();
    const r2 = rig();
    h.hostResult = { peer: r2.peer, offer: 'O' };
    mountOnline(host);
    await click('onlineHost');
    await click('onlineConnect');
    unmountOnline();
    r2.failLink();
    await tick(0);
    expect(host.textContent).not.toContain('The connection failed');
  });

  it('a match that ends after unmount is ignored', async () => {
    const r = rig();
    await hostToPick(r);
    await click('onlineReady');
    const hostMsg = r.friend.receive();
    const hostPick = hostMsg && decodePick(hostMsg);
    if (!hostPick) throw new Error('no pick');
    const friendPick: OnlinePick = { race: characterId('pax'), seed: 0 };
    r.friend.send(encodePick(friendPick));
    await tick();
    const hs = new SetupHandshake(r.friend, helloOf(onlineSetup(hostPick, friendPick)));
    for (let i = 0; i < 4 && h.created.length === 0; i++) {
      hs.poll();
      await tick();
    }
    const launch = h.created[0]?.launch;
    unmountOnline();
    await tick(0);
    expect(() => launch?.onEnd?.({ winner: 1, activeSlot: 0, capturedIndices: [] })).not.toThrow();
    expect(host.querySelector('#onlineAgain')).toBeNull();
  });
});
