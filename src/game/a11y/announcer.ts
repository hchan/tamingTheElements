import { SimEventKind, TrapReason, type SimEvent } from '@core/index';
import { TRAP_WORDS } from '../fx/trap-fx';

/** A line for the screen-reader live region. `important` lines bypass throttling and are assertive. */
export interface Announcement {
  readonly key: string;
  readonly text: string;
  readonly important: boolean;
}

/** Pure: sim events to announcements. Hits are deliberately silent (they would flood a screen reader). `teamOf` maps an entity id to its team (trap armed events carry only the owner). */
export function announcementsFor(events: readonly SimEvent[], teamOf: (entity: number) => number = () => 0): Announcement[] {
  const out: Announcement[] = [];
  for (const e of events) {
    switch (e.kind) {
      case SimEventKind.captured:
        out.push({ key: 'snagged', text: 'Snagged the opponent.', important: false });
        break;
      case SimEventKind.captureFailed:
        out.push({ key: 'snagFailed', text: 'Snag failed.', important: false });
        break;
      case SimEventKind.died:
        out.push(
          e['team'] === 0
            ? { key: 'heroDied', text: 'Your elemental was defeated.', important: false }
            : { key: 'foeDied', text: 'Enemy elemental defeated.', important: false },
        );
        break;
      case SimEventKind.matchEnded: {
        const w = e['winner'] ?? -1;
        // Arcade (best of 3) carries the round score.
        const rounds = e['won0'] === undefined ? '' : ` Rounds ${String(e['won0'])} to ${String(e['won1'] ?? 0)}.`;
        out.push({
          key: 'matchEnded',
          text: (w === 0 ? 'Victory. You won the match.' : w === 1 ? 'Defeat. You lost the match.' : 'The match ended in a draw.') + rounds,
          important: true,
        });
        break;
      }
      case SimEventKind.trapPlaced:
      case SimEventKind.trapArmed:
      case SimEventKind.trapTriggered: {
        const a = trapAnnouncement(e, teamOf);
        if (a) out.push(a);
        break;
      }
      case SimEventKind.elementalCast: {
        const a = elementalAnnouncement(e);
        if (a) out.push(a);
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/**
 * Word-only trap lines (polite, never important). Your own traps: placed, armed, triggered, expired, doused; the foe's: placed,
 * triggered and doused, not armed or expired (chatter). Keys carry the side, the trap kind and the step (two kinds never silence each other), so the Announcer's repeat window
 * (6 s per key) and 3-line queue keep a trap spam quiet.
 */
function trapAnnouncement(e: SimEvent, teamOf: (entity: number) => number): Announcement | undefined {
  // trapArmed carries no team: its sourceId is the owner entity.
  const mine = (e['team'] ?? teamOf(e.sourceId)) === 0;
  const name = TRAP_WORDS[e['trap'] ?? 0] ?? 'trap';
  const who = mine ? 'Your' : 'Enemy';
  const kind = String(e['trap'] ?? 0);
  const side = mine ? `trapMine${kind}` : `trapFoe${kind}`;
  if (e.kind === SimEventKind.trapPlaced) return { key: `${side}Placed`, text: `${who} ${name} placed.`, important: false };
  if (e.kind === SimEventKind.trapArmed) return mine ? { key: `${side}Armed`, text: `Your ${name} is armed.`, important: false } : undefined;
  const reason = e['reason'] ?? TrapReason.overlap;
  if (reason === TrapReason.doused) return { key: `${side}Doused`, text: `${who} ${name} doused.`, important: false };
  if (reason === TrapReason.timeout) return mine ? { key: `${side}Expired`, text: `Your ${name} expired.`, important: false } : undefined;
  return { key: `${side}Triggered`, text: `${who} ${name} triggered.`, important: false };
}

/** Elemental ability lines (FUN-DESIGN 2.24) by element kind (1 fire, 2 water, 3 earth, 4 air): the name, then what it does. */
const ELEMENTAL_LINES: readonly (readonly [string, string])[] = [
  ['', ''],
  ['Ember', 'attack up'],
  ['Cleanse', 'debuffs cleared'],
  ['Stoneskin', 'armor up'],
  ['Gale', 'speed up'],
];

/** "Your Gale: speed up." / "Enemy Cleanse: 2 debuffs cleared." Polite; the key carries the side and the element. */
function elementalAnnouncement(e: SimEvent): Announcement | undefined {
  const kind = e['element'] ?? 0;
  const line = ELEMENTAL_LINES[kind];
  if (!line || line[0] === '') return undefined;
  const mine = (e['team'] ?? 0) === 0;
  const cleared = e['cleared'] ?? 0;
  const what = kind === 2 ? (cleared > 0 ? `${String(cleared)} ${cleared === 1 ? 'debuff' : 'debuffs'} cleared` : 'nothing to clear') : line[1];
  return { key: `elemental${mine ? 'Mine' : 'Foe'}${String(kind)}`, text: `${mine ? 'Your' : 'Enemy'} ${line[0]}: ${what}.`, important: false };
}

export const MATCH_START: Announcement = {
  key: 'matchStart',
  text: 'Match started. Press Shift P to pause.',
  important: true,
};

export const LOW_HEALTH: Announcement = { key: 'lowHealth', text: 'Low health.', important: false };

/** Fires once when health drops to the critical line and re-arms only after it recovers past `rearmAbove`. */
export class LowHealthWatch {
  private armed = true;

  constructor(
    private readonly criticalAt = 0.25,
    private readonly rearmAbove = 0.4,
  ) {}

  /** `fraction` is 0..1, or undefined when there is no active hero. True exactly when to announce. */
  update(fraction: number | undefined): boolean {
    if (fraction === undefined) return false;
    if (fraction > this.rearmAbove) this.armed = true;
    if (this.armed && fraction <= this.criticalAt && fraction > 0) {
      this.armed = false;
      return true;
    }
    return false;
  }
}

export interface AnnouncerOptions {
  /** Minimum gap between two spoken lines. */
  readonly minGapMs?: number;
  /** The same key is not repeated inside this window. */
  readonly repeatMs?: number;
  /** Most lines kept waiting; older ones are dropped first. */
  readonly maxQueue?: number;
}

/**
 * Throttle in front of a live region: no flood, no repeats of the same line, important lines
 * (match start/end) go out at once, carrying any lines still waiting. Time is injected.
 */
export class Announcer {
  private lastSent = Number.NEGATIVE_INFINITY;
  private readonly lastByKey = new Map<string, number>();
  private queue: Announcement[] = [];
  private readonly minGap: number;
  private readonly repeat: number;
  private readonly maxQueue: number;

  constructor(
    private readonly speak: (text: string, assertive: boolean) => void,
    private readonly now: () => number,
    opts: AnnouncerOptions = {},
  ) {
    this.minGap = opts.minGapMs ?? 1500;
    this.repeat = opts.repeatMs ?? 6000;
    this.maxQueue = opts.maxQueue ?? 3;
  }

  say(a: Announcement): void {
    const t = this.now();
    const prev = this.lastByKey.get(a.key);
    if (!a.important && prev !== undefined && t - prev < this.repeat) return;
    if (a.important) {
      // Lines still waiting (e.g. a capture on the same tick as the win) are folded in, so none is lost.
      const waiting = this.queue.map((q) => q.text);
      this.queue = [];
      this.send({ ...a, text: [...waiting, a.text].join(' ') }, t);
      return;
    }
    if (this.queue.length === 0 && t - this.lastSent >= this.minGap) {
      this.send(a, t);
      return;
    }
    this.queue.push(a);
    // Over the cap: drop trap chatter first (oldest first), then the oldest line, so a death or defeat is never lost to a trap line.
    while (this.queue.length > this.maxQueue) {
      const trap = this.queue.findIndex((q) => q.key.startsWith('trap'));
      this.queue.splice(trap < 0 ? 0 : trap, 1);
    }
  }

  /** Call each frame: releases the next waiting line once the gap has passed. */
  flush(): void {
    const t = this.now();
    const next = this.queue[0];
    if (next === undefined || t - this.lastSent < this.minGap) return;
    this.queue.shift();
    this.send(next, t);
  }

  /** The texts still waiting, oldest first. */
  get queued(): string[] {
    return this.queue.map((q) => q.text);
  }

  get pending(): number {
    return this.queue.length;
  }

  private send(a: Announcement, t: number): void {
    this.lastSent = t;
    this.lastByKey.set(a.key, t);
    this.speak(a.text, a.important);
  }
}

export interface LiveRegion {
  speak(text: string, assertive: boolean): void;
  destroy(): void;
}

/** Visually hidden polite and assertive regions. Text is re-inserted so an identical line is read again. */
export function createLiveRegion(doc: Document = document, defer: (fn: () => void) => void = (fn) => void setTimeout(fn, 30)): LiveRegion {
  const make = (id: string, role: 'status' | 'alert', live: 'polite' | 'assertive'): HTMLElement => {
    const n = doc.createElement('div');
    n.id = id;
    n.className = 'srOnly';
    n.setAttribute('role', role);
    n.setAttribute('aria-live', live);
    n.setAttribute('aria-atomic', 'true');
    doc.body.append(n);
    return n;
  };
  const polite = make('liveRegion', 'status', 'polite');
  const assertive = make('liveRegionAssertive', 'alert', 'assertive');
  let alive = true;
  return {
    speak(text, isAssertive) {
      const target = isAssertive ? assertive : polite;
      target.textContent = '';
      defer(() => {
        if (alive) target.textContent = text;
      });
    },
    destroy() {
      alive = false;
      polite.remove();
      assertive.remove();
    },
  };
}
