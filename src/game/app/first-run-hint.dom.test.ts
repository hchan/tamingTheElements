// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD_WAIT_CAP_POLLS, CARD_WAIT_KEYS, FIGHT_OVER_EVENT, FIGHT_SETTLED_EVENT, IDLE_POLL_MS, afterArenaCreate, arenaBusy, bannerUp, whenIdle, FIRST_RUN_KEY, FIRST_RUN_REMOVE_MS, ROUND_OVER_EVENT, SUPER_CUT_EVENT, TAG_CALL_EVENT, anySnag, firstRunHint, firstRunLines, firstRunSeen, firstRunPhoneLine, firstRunShortLine, markFirstRunSeen } from './first-run-hint';
import { CUT_KEY } from '../hud/banner-lanes';
import { TAG_CALL_KEY } from '../hud/arcade-hud';
import { PRELOAD_READY } from '../scenes/launch';
import { labelsFromBindings } from '../hud/action-bar';
import { DEFAULT_BINDINGS, actionKeyLabel } from '../platform/input/bindings';

const memory = (): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('markFirstRunSeen', () => {
  it('makes firstRunSeen true', () => {
    const store = memory();
    expect(firstRunSeen(store)).toBe(false);
    markFirstRunSeen(store);
    expect(firstRunSeen(store)).toBe(true);
  });
});

describe('firstRunHint', () => {
  it('shows on a fresh store, in words, and Got it removes it and remembers', () => {
    const store = memory();
    const card = firstRunHint(store);
    expect(card).not.toBeNull();
    document.body.append(card as HTMLElement);
    expect(card?.textContent).toContain('First blood');
    expect(card?.textContent).not.toMatch(/classic|arcade|ruleset|capture/i);
    card?.querySelector('button')?.click();
    expect(document.getElementById('firstRunHint')).toBeNull();
    expect(store.data.get(FIRST_RUN_KEY)).toBe('1');
    expect(firstRunSeen(store)).toBe(true);
    expect(firstRunHint(store)).toBeNull();
  });

  it('stays hidden and does not start its fade timer until the arena is ready', () => {
    vi.useFakeTimers();
    const store = memory();
    let ready = (): void => undefined;
    const card = firstRunHint(store, 1000, (go) => { ready = go; });
    vi.advanceTimersByTime(5000);
    expect(card?.classList.contains('firstRunWait')).toBe(true);
    expect(firstRunSeen(store)).toBe(false);
    ready();
    expect(card?.classList.contains('firstRunWait')).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(firstRunSeen(store)).toBe(true);
  });

  it('fades and counts as seen after the timer', () => {
    vi.useFakeTimers();
    const store = memory();
    const card = firstRunHint(store, 1000);
    vi.advanceTimersByTime(1000);
    expect(card?.classList.contains('firstRunFade')).toBe(true);
    expect(firstRunSeen(store)).toBe(true);
  });

  it('fades at once when the round ends, and a lone hero gets no Tag line', () => {
    const store = memory();
    const card = firstRunHint(store, 60000, (go) => { go(); }, true, undefined, false);
    document.body.append(card as HTMLElement);
    expect(card?.textContent).not.toMatch(/Tag/);
    window.dispatchEvent(new Event(ROUND_OVER_EVENT));
    expect(card?.classList.contains('firstRunFade')).toBe(true);
    expect(firstRunSeen(store)).toBe(true);
    expect(firstRunLines(DEFAULT_BINDINGS, false, true, undefined, true).join(' ')).toContain('Tag with 3');
    expect(firstRunLines(DEFAULT_BINDINGS, true, true, undefined, false).join(' ')).not.toMatch(/Tag/);
  });

  it('leaves at once when a super cut-in starts', () => {
    const store = memory();
    const card = firstRunHint(store, 60000);
    document.body.append(card as HTMLElement);
    window.dispatchEvent(new Event(SUPER_CUT_EVENT));
    expect(card?.classList.contains('firstRunFade')).toBe(true);
    expect(card?.isConnected).toBe(false);
    expect(firstRunSeen(store)).toBe(true);
  });

  it('a card already fading from a tap still leaves at once when the super cut-in or tag call starts (QA r91)', () => {
    for (const ev of [SUPER_CUT_EVENT, TAG_CALL_EVENT]) {
      const card = firstRunHint(memory(), 60000);
      document.body.append(card as HTMLElement);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
      expect(card?.classList.contains('firstRunFade')).toBe(true);
      expect(card?.isConnected).toBe(true);
      window.dispatchEvent(new Event(ev));
      expect(card?.isConnected).toBe(false);
    }
  });

  it('leaves at once when a tag call starts (QA r41), and on the first Strike tap', () => {
    const store = memory();
    const card = firstRunHint(store, 60000);
    document.body.append(card as HTMLElement);
    window.dispatchEvent(new Event(TAG_CALL_EVENT));
    expect(card?.classList.contains('firstRunFade')).toBe(true);
    expect(card?.isConnected).toBe(false);
    const store2 = memory();
    const card2 = firstRunHint(store2, 60000);
    const strike = document.createElement('button');
    document.body.append(card2 as HTMLElement, strike);
    strike.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(card2?.classList.contains('firstRunFade')).toBe(true);
  });

  it('fades at the first key or tap outside the card, but not on Tab', () => {
    const store = memory();
    const card = firstRunHint(store);
    document.body.append(card as HTMLElement);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(card?.classList.contains('firstRunFade')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(card?.classList.contains('firstRunFade')).toBe(true);
    expect(firstRunSeen(store)).toBe(true);
  });

  it('survives a throwing store: reads as unseen and never throws', () => {
    const bad = {
      getItem: (): string | null => {
        throw new Error('no');
      },
      setItem: (): void => {
        throw new Error('no');
      },
    };
    expect(firstRunSeen(bad)).toBe(false);
    expect(() => firstRunHint(bad)?.querySelector('button')?.click()).not.toThrow();
  });

  it('has a one-line short form that keeps the key names and drops Snag or Tag when absent (QA r31)', () => {
    const line = firstRunShortLine(DEFAULT_BINDINGS);
    expect(line).toMatch(/Attack 1.*Dash 7.*Guard 8.*Super 9.*Tag 3/);
    expect(line).toMatch(/Snag C/);
    expect(firstRunShortLine(DEFAULT_BINDINGS, false, false)).not.toMatch(/Snag|Tag/);
  });

  it('names the live keys', () => {
    expect(firstRunLines({ ...DEFAULT_BINDINGS, dash: ['KeyV'] }).join(' ')).toContain('Dash with V');
  });

  it('names every key exactly as the action bar labels it (Dash 7, Guard 8, Super 9, Tag 3, Cleanse =)', () => {
    const text = firstRunLines(DEFAULT_BINDINGS).join(' ');
    expect(text).toContain('Attack with 1 or Space.');
    expect(text).toContain('Second attack with 2 or Enter.');
    const named = firstRunLines(DEFAULT_BINDINGS, false, true, undefined, true, ['Blast', 'Flame']).join(' ');
    expect(named).toContain('Blast with 1 or Space. Flame with 2 or Enter.');
    expect(named).not.toMatch(/Strike|Special/);
    expect(text).toContain('Snag with C');
    expect(text).toContain('Dash with 7;');
    expect(text).toContain('hold 8 to Guard');
    expect(text).toContain('press 9.');
    expect(text).toContain('Tag with 3 ');
    expect(text).toContain('press = to Cleanse');
    for (const a of ['slot1', 'dash', 'guard', 'super', 'slot3', 'cleanse'] as const) expect(actionKeyLabel(DEFAULT_BINDINGS, a)).toBeDefined();
    expect(Object.values(labelsFromBindings(DEFAULT_BINDINGS))).toEqual(expect.arrayContaining(['7', '8', '9', '=']));
  });

  it('describes the touch controls on a touch device and the live keys otherwise', () => {
    const touch = firstRunLines(DEFAULT_BINDINGS, true).join(' ');
    expect(touch).toMatch(/stick/i);
    expect(touch).not.toMatch(/WASD|arrows|press /i);
    const keys = firstRunLines(DEFAULT_BINDINGS).join(' ');
    expect(keys).toContain('Up/W');
    expect(keys).not.toMatch(/stick|tap/i);
    expect(keys + touch).not.toMatch(/classic|arcade|ruleset|capture/i);
  });

  it('the landscape phone line names the bar and keeps Snag only when present (the e2e "Tap the bar" check)', () => {
    expect(firstRunPhoneLine()).toMatch(/Tap the bar/);
    expect(firstRunPhoneLine()).toContain('Snag');
    expect(firstRunPhoneLine(false)).not.toContain('Snag');
  });

  it('names Snag only for a side that has it (Treenoc, Wispera, Curomo, Echo)', () => {
    expect(anySnag(['sindarosa', 'pax'])).toBe(false);
    expect(anySnag(['sindarosa', 'treenoc'])).toBe(true);
    expect(firstRunLines(DEFAULT_BINDINGS, false, false).join(' ')).not.toMatch(/snag/i);
    expect(firstRunLines(DEFAULT_BINDINGS, true, false).join(' ')).not.toMatch(/snag/i);
    expect(firstRunLines(DEFAULT_BINDINGS, true, true).join(' ')).toMatch(/snag/i);
  });

  it('names the key of the own Snag box as Snag, so the card and the bar agree (Echo: 1 is Snag)', () => {
    const echo = firstRunLines(DEFAULT_BINDINGS, false, true, 0).join(' ');
    expect(echo).toContain('Snag with C or 1');
    expect(echo).not.toContain('Attack with 1');
    expect(echo).toContain('Attack with 2 or Enter');
    const curomo = firstRunLines(DEFAULT_BINDINGS, false, true, 1).join(' ');
    expect(curomo).toContain('Snag with C or 2');
    expect(curomo).toContain('Attack with 1 or Space');
    expect(firstRunLines(DEFAULT_BINDINGS, true, true).join(' ')).toMatch(/Snag box/);
  });

  it('stays unfaded while the rotate overlay is up', () => {
    vi.useFakeTimers();
    const overlay = document.createElement('div');
    overlay.id = 'rotateOverlay';
    document.body.append(overlay);
    const card = firstRunHint(memory(), 100) as HTMLElement;
    document.body.append(card);
    vi.advanceTimersByTime(1000);
    expect(card.classList.contains('firstRunFade')).toBe(false);
    overlay.hidden = true;
    vi.advanceTimersByTime(1000);
    expect(card.classList.contains('firstRunFade')).toBe(true);
    overlay.remove();
    card.remove();
    vi.useRealTimers();
  });
});

describe('firstRunHint, PHONE-2 settle and removal', () => {
  const transitionEnd = (target: EventTarget, propertyName: string): void => {
    const e = new Event('transitionend', { bubbles: true });
    Object.defineProperty(e, 'propertyName', { value: propertyName });
    target.dispatchEvent(e);
  };

  it('pins the event name and the removal delay', () => {
    expect(FIGHT_SETTLED_EVENT).toBe('tte:fight-settled');
    expect(FIRST_RUN_REMOVE_MS).toBeGreaterThan(1500);
    expect(FIRST_RUN_REMOVE_MS).not.toBe(2500);
  });

  it('fades and counts as seen when the fight settles', () => {
    const store = memory();
    const card = firstRunHint(store, 60000) as HTMLElement;
    document.body.append(card);
    window.dispatchEvent(new Event(FIGHT_SETTLED_EVENT));
    expect(card.classList.contains('firstRunFade')).toBe(true);
    expect(firstRunSeen(store)).toBe(true);
  });

  it('ignores the settle under the rotate overlay, and the timer still fades it later', () => {
    vi.useFakeTimers();
    const overlay = document.createElement('div');
    overlay.id = 'rotateOverlay';
    document.body.append(overlay);
    const card = firstRunHint(memory(), 100) as HTMLElement;
    document.body.append(card);
    window.dispatchEvent(new Event(FIGHT_SETTLED_EVENT));
    expect(card.classList.contains('firstRunFade')).toBe(false);
    overlay.hidden = true;
    vi.advanceTimersByTime(1000);
    expect(card.classList.contains('firstRunFade')).toBe(true);
  });

  it('leaves the DOM 1600 ms after the fade, not before', () => {
    vi.useFakeTimers();
    const card = firstRunHint(memory(), 1000) as HTMLElement;
    document.body.append(card);
    vi.advanceTimersByTime(1000);
    expect(card.classList.contains('firstRunFade')).toBe(true);
    vi.advanceTimersByTime(FIRST_RUN_REMOVE_MS - 1);
    expect(card.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(card.isConnected).toBe(false);
  });

  it('is removed by the opacity transitionend, but not by a child target or another property', () => {
    const card = firstRunHint(memory(), 60000) as HTMLElement;
    document.body.append(card);
    window.dispatchEvent(new Event(FIGHT_SETTLED_EVENT));
    const child = card.querySelector('button') as HTMLElement;
    transitionEnd(child, 'opacity');
    transitionEnd(card, 'transform');
    expect(card.isConnected).toBe(true);
    transitionEnd(card, 'opacity');
    expect(card.isConnected).toBe(false);
  });

  it('Got it removes the settle listener', () => {
    const store = memory();
    const card = firstRunHint(store, 60000) as HTMLElement;
    document.body.append(card);
    card.querySelector('button')?.click();
    expect(() => window.dispatchEvent(new Event(FIGHT_SETTLED_EVENT))).not.toThrow();
    expect(card.classList.contains('firstRunFade')).toBe(false);
  });
});

/** The slice of Phaser's EventEmitter the gate uses (once, off, emit). */
class EventEmitter {
  private readonly subs = new Map<string, Set<() => void>>();
  once(name: string, fn: () => void): this {
    const wrap = (): void => {
      this.off(name, wrap);
      fn();
    };
    return this.on(name, wrap, fn);
  }
  private on(name: string, wrap: () => void, orig: () => void): this {
    const set = this.subs.get(name) ?? new Set();
    (wrap as { orig?: () => void }).orig = orig;
    set.add(wrap);
    this.subs.set(name, set);
    return this;
  }
  off(name: string, fn: () => void): this {
    const set = this.subs.get(name);
    if (!set) return this;
    for (const w of [...set]) if (w === fn || (w as { orig?: () => void }).orig === fn) set.delete(w);
    return this;
  }
  emit(name: string): void {
    for (const w of [...(this.subs.get(name) ?? [])]) w();
  }
}

describe('HINT-CUT-1: the card waits for a live super cut or tag call', () => {
  const fakeGame = (): { game: object; events: EventEmitter; reg: Map<string, unknown> } => {
    const events = new EventEmitter();
    const reg = new Map<string, unknown>();
    const scene = { sys: { settings: { status: 5 } }, events: new EventEmitter() };
    return { game: { scene: { getScene: () => scene }, events, registry: reg }, events, reg };
  };
  /** Starts the card's gate on a fake game whose Arena is already running; fight-over is sent by the caller. */
  const arm = (): { go: ReturnType<typeof vi.fn>; events: EventEmitter; reg: Map<string, unknown> } => {
    const f = fakeGame();
    const go = vi.fn();
    afterArenaCreate(f.game)(go);
    f.events.emit(PRELOAD_READY);
    return { go, events: f.events, reg: f.reg };
  };
  const fightOver = (): void => {
    window.dispatchEvent(new Event(FIGHT_OVER_EVENT));
  };

  it('pins the registry literals to the real keys', () => {
    expect(CARD_WAIT_KEYS.cut).toBe(CUT_KEY);
    expect(CARD_WAIT_KEYS.tagCall).toBe(TAG_CALL_KEY);
  });

  it('arenaBusy: a live cut or a tag call with width is busy, nothing else', () => {
    const reg = new Map<string, unknown>();
    expect(arenaBusy(undefined)).toBe(false);
    expect(arenaBusy(reg)).toBe(false);
    reg.set(CARD_WAIT_KEYS.cut, false);
    expect(arenaBusy(reg)).toBe(false);
    reg.set(CARD_WAIT_KEYS.cut, true);
    expect(arenaBusy(reg)).toBe(true);
    reg.set(CARD_WAIT_KEYS.cut, undefined);
    reg.set(CARD_WAIT_KEYS.tagCall, { w: 0 });
    expect(arenaBusy(reg)).toBe(false);
    reg.set(CARD_WAIT_KEYS.tagCall, { w: 12 });
    expect(arenaBusy(reg)).toBe(true);
  });

  it('whenIdle: idle runs at once with no timer, blocked then idle runs once, cap and cancel', () => {
    vi.useFakeTimers();
    const go = vi.fn();
    whenIdle(() => false, go);
    expect(go).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    let blocked = true;
    const go2 = vi.fn();
    whenIdle(() => blocked, go2);
    vi.advanceTimersByTime(IDLE_POLL_MS * 3);
    expect(go2).not.toHaveBeenCalled();
    blocked = false;
    vi.advanceTimersByTime(IDLE_POLL_MS);
    expect(go2).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(IDLE_POLL_MS * 10);
    expect(go2).toHaveBeenCalledTimes(1);
    const go3 = vi.fn();
    whenIdle(() => true, go3, 100, 5);
    vi.advanceTimersByTime(400);
    expect(go3).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(go3).toHaveBeenCalledTimes(1);
    const go4 = vi.fn();
    const cancel = whenIdle(() => true, go4);
    cancel();
    vi.advanceTimersByTime(60000);
    expect(go4).not.toHaveBeenCalled();
  });

  it('idle: the reveal runs on fight-over', () => {
    vi.useFakeTimers();
    const { go } = arm();
    expect(go).not.toHaveBeenCalled();
    fightOver();
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('a live round banner at fight-over holds the reveal until it clears (next 100 ms check)', () => {
    vi.useFakeTimers();
    const { go, reg } = arm();
    reg.set(CARD_WAIT_KEYS.banner, true);
    fightOver();
    vi.advanceTimersByTime(IDLE_POLL_MS * 5);
    expect(go).not.toHaveBeenCalled();
    reg.set(CARD_WAIT_KEYS.banner, false);
    vi.advanceTimersByTime(IDLE_POLL_MS);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('bannerUp reads the tte.banner key', () => {
    expect(CARD_WAIT_KEYS.banner).toBe('tte.banner');
    expect(bannerUp(undefined)).toBe(false);
    expect(bannerUp(new Map([['tte.banner', true]]))).toBe(true);
    expect(bannerUp(new Map([['tte.banner', false]]))).toBe(false);
  });

  it('a super cut before the reveal drops the card for this session: it never shows after the super', () => {
    vi.useFakeTimers();
    const { go } = arm();
    window.dispatchEvent(new Event(SUPER_CUT_EVENT));
    fightOver();
    vi.advanceTimersByTime(20000);
    expect(go).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a dropped card is removed from the DOM, not left hidden', () => {
    vi.useFakeTimers();
    const f = fakeGame();
    const card = firstRunHint({ getItem: () => null, setItem: () => undefined }, 2500, afterArenaCreate(f.game));
    document.body.append(card as HTMLElement);
    f.events.emit(PRELOAD_READY);
    window.dispatchEvent(new Event(SUPER_CUT_EVENT));
    fightOver();
    expect(document.getElementById('firstRunHint')).toBeNull();
  });

  it('a tag call before the reveal drops the card too', () => {
    vi.useFakeTimers();
    const { go } = arm();
    window.dispatchEvent(new Event(TAG_CALL_EVENT));
    fightOver();
    vi.advanceTimersByTime(20000);
    expect(go).not.toHaveBeenCalled();
  });

  it('a live cut key at the reveal (no event seen) drops the card', () => {
    vi.useFakeTimers();
    const { go, reg } = arm();
    reg.set(CARD_WAIT_KEYS.cut, true);
    fightOver();
    reg.set(CARD_WAIT_KEYS.cut, false);
    vi.advanceTimersByTime(20000);
    expect(go).not.toHaveBeenCalled();
  });

  it('a super cut while the card waits on a banner drops it', () => {
    vi.useFakeTimers();
    const { go, reg } = arm();
    reg.set(CARD_WAIT_KEYS.banner, true);
    fightOver();
    window.dispatchEvent(new Event(SUPER_CUT_EVENT));
    reg.set(CARD_WAIT_KEYS.banner, false);
    vi.advanceTimersByTime(20000);
    expect(go).not.toHaveBeenCalled();
  });

  it('the round ending while the card waits drops it for this battle', () => {
    vi.useFakeTimers();
    const { go, reg } = arm();
    reg.set(CARD_WAIT_KEYS.banner, true);
    fightOver();
    window.dispatchEvent(new Event(ROUND_OVER_EVENT));
    reg.set(CARD_WAIT_KEYS.banner, false);
    vi.advanceTimersByTime(20000);
    expect(go).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('destroying the game during the intro cancels the 7 s fallback (a quit never reveals a detached card)', () => {
    vi.useFakeTimers();
    const { go, events } = arm();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    events.emit('destroy');
    vi.advanceTimersByTime(20000);
    expect(go).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    events.emit('destroy');
    fightOver();
    expect(go).not.toHaveBeenCalled();
  });

  it('a leaked banner key cannot hold the card for ever: it shows after the cap', () => {
    vi.useFakeTimers();
    const { go, reg } = arm();
    reg.set(CARD_WAIT_KEYS.banner, true);
    fightOver();
    vi.advanceTimersByTime(IDLE_POLL_MS * (CARD_WAIT_CAP_POLLS - 1));
    expect(go).not.toHaveBeenCalled();
    vi.advanceTimersByTime(IDLE_POLL_MS);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('the 7 s fallback path goes through the same gate', () => {
    vi.useFakeTimers();
    const { go, reg } = arm();
    reg.set(CARD_WAIT_KEYS.banner, true);
    vi.advanceTimersByTime(7000);
    expect(go).not.toHaveBeenCalled();
    reg.set(CARD_WAIT_KEYS.banner, false);
    vi.advanceTimersByTime(IDLE_POLL_MS);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('once shown, a cut that starts removes the card on the spot (slow cut chunk)', () => {
    vi.useFakeTimers();
    const f = fakeGame();
    const store = memory();
    const card = firstRunHint(store, 60000, afterArenaCreate(f.game));
    document.body.append(card as HTMLElement);
    f.events.emit(PRELOAD_READY);
    fightOver();
    expect(card?.classList.contains('firstRunWait')).toBe(false);
    f.reg.set(CARD_WAIT_KEYS.cut, true);
    vi.advanceTimersByTime(IDLE_POLL_MS);
    expect(card?.isConnected).toBe(false);
  });
});

describe('firstRunHint in portrait play', () => {
  const stub = (coarse: boolean, portrait: boolean): void => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: coarse') && !q.includes('orientation') ? coarse : coarse && portrait }));
  };
  afterEach(() => vi.unstubAllGlobals());

  it('is one phone line with no footer and no 11 px font', () => {
    stub(true, true);
    const card = firstRunHint(memory(), 2500, (go) => { go(); }, true) as HTMLElement;
    const one = card.querySelectorAll('p.firstRunOne');
    expect(one).toHaveLength(1);
    expect(one[0]?.textContent).toMatch(/snag/i);
    expect(card.querySelectorAll('p')).toHaveLength(1);
    expect(card.querySelector('.firstRunMore')).toBeNull();
    expect(card.style.fontSize).toBe('');
  });

  it('leaves out Snag without it', () => {
    stub(true, true);
    const card = firstRunHint(memory(), 2500, (go) => { go(); }, false) as HTMLElement;
    expect(card.querySelector('p.firstRunOne')?.textContent).not.toMatch(/snag/i);
  });

  it('is unchanged when not portrait play', () => {
    stub(true, false);
    vi.stubGlobal('innerHeight', 900);
    const card = firstRunHint(memory(), 2500, (go) => { go(); }, true) as HTMLElement;
    expect(card.querySelector('p.firstRunOne')).toBeNull();
    expect(card.querySelector('.firstRunMore')).not.toBeNull();
  });
});
