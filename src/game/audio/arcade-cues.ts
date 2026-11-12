import type { SimEvent, SimEventKind } from '@core/index';

/**
 * Pure rules of the Arcade audio layers (WP-arcade-audio-layers, FUN-DESIGN section 3): which synthesised cue each
 * Arcade sim event plays, at what pitch and gain, and the voice limit. No Web Audio here; `arcade-audio.ts` renders a
 * cue's layers with oscillators and band-passed noise. Classic never emits these events and never loads this module.
 */

type Kinds = typeof SimEventKind;
/**
 * Event kinds are numbers checked against `SimEventKind` by type (here) or by a test (`KIND_CUES`): the chunk imports
 * nothing from core at run time, since a value import would add Vite's preload list to the `import()` that loads it.
 */
export const KO: Kinds['ko'] = 55;

/** Oscillator types by layer wave 0..3; wave 4 is band-passed white noise. */
export const WAVES = ['sine', 'triangle', 'square', 'sawtooth'] as const;
export const NOISE = 4;

/** One layer: wave, start and end frequency (Hz, exponential sweep), length (ms), gain (0..1), delay (ms, default 0). */
export type Layer = readonly [wave: number, f0: number, f1: number, ms: number, gain: number, delay?: number];

/** Every cue as layers, all short (at most 0.7 s with delays). */
export const CUES = {
  /** The hit thump (light to heavy) and the super-strength impact. */
  thump: [[0, 120, 45, 70, 1]],
  impact: [[0, 90, 30, 170, 1], [NOISE, 900, 200, 120, 0.5]],
  /** The combo tick, pitched up per hit. */
  combo: [[1, 660, 660, 45, 0.25]],
  guard: [[1, 200, 90, 60, 0.5], [NOISE, 500, 300, 40, 0.2]],
  parry: [[0, 1568, 1568, 260, 0.35], [0, 2349, 2349, 180, 0.15]],
  crack: [[NOISE, 3200, 700, 160, 0.6], [2, 110, 40, 140, 0.25]],
  dash: [[NOISE, 500, 2500, 150, 0.35]],
  dodge: [[0, 1200, 2400, 140, 0.2]],
  clang: [[2, 523, 510, 200, 0.15], [2, 784, 770, 170, 0.1], [NOISE, 2500, 1500, 60, 0.3]],
  /** The super's charge riser, under the sound map's whoosh. */
  charge: [[3, 110, 880, 420, 0.16]],
  /** Snag (FUN-DESIGN 2.20): the rope whip and its snap. */
  snag: [[NOISE, 1800, 400, 110, 0.35], [1, 330, 165, 90, 0.2, 60]],
  /** Traps (WP 39): the plant thunk, the arming click and the trigger pop. */
  trapSet: [[0, 180, 90, 90, 0.4]],
  trapArm: [[1, 1320, 1320, 40, 0.15]],
  trapPop: [[NOISE, 1400, 250, 180, 0.5], [0, 110, 40, 140, 0.5]],
  /** A refused action (a swap while stunned or cooling down): two short low buzzes, never a stinger. */
  denied: [[2, 150, 120, 70, 0.3], [2, 150, 120, 70, 0.3, 100]],
  sun: [[1, 523, 523, 140, 0.2], [1, 659, 659, 140, 0.2, 90], [1, 784, 784, 220, 0.2, 180]],
  rain: [[0, 1397, 1046, 90, 0.2], [0, 1175, 880, 90, 0.2, 110], [0, 988, 698, 140, 0.2, 220]],
  sand: [[NOISE, 300, 1200, 420, 0.3], [1, 147, 147, 300, 0.15]],
  gale: [[NOISE, 800, 3000, 300, 0.3], [NOISE, 3000, 900, 300, 0.25, 250]],
  eclipse: [[3, 98, 92, 500, 0.15], [3, 147, 139, 500, 0.12]],
  round: [[1, 262, 262, 200, 0.3], [1, 392, 392, 260, 0.3, 160]],
  fight: [[2, 440, 880, 140, 0.18], [NOISE, 1500, 600, 120, 0.35]],
  ko: [[0, 80, 28, 500, 1], [NOISE, 1800, 120, 380, 0.5]],
  roundEnd: [[1, 392, 392, 320, 0.2], [1, 494, 494, 320, 0.16], [1, 587, 587, 320, 0.16]],
  /** Rising arpeggio; a loss or draw plays it lower (the sound map's victory or death sample plays too). */
  match: [[1, 523, 523, 120, 0.22], [1, 659, 659, 120, 0.22, 110], [1, 784, 784, 120, 0.22, 220], [1, 1046, 1046, 360, 0.22, 330]],
} as const satisfies Record<string, readonly Layer[]>;
export type CueName = keyof typeof CUES;

/** Round and match stingers always play; any other cue is dropped when the voice pool is full. */
export const STINGERS: ReadonlySet<CueName> = new Set<CueName>(['round', 'fight', 'ko', 'roundEnd', 'match']);

/**
 * The cue of each `SimEventKind` (numbers, see `KO`; a test checks every key against the names): hitConfirmed (41) plays
 * the thump or impact and the combo tick, weatherChanged (59) its weather's stinger and matchEnded (30) the match one.
 */
export const KIND_CUES: Readonly<Partial<Record<number, CueName>>> = {
  43: 'guard', 44: 'parry', 45: 'crack', 46: 'dash', 47: 'dodge', 48: 'clang', 50: 'charge', 53: 'round', 54: 'fight',
  55: 'ko', 57: 'roundEnd', 67: 'dash', 70: 'trapSet', 71: 'trapArm', 72: 'trapPop',
};
const HIT: Kinds['hitConfirmed'] = 41;
const WEATHER: Kinds['weatherChanged'] = 59;
const MATCH_END: Kinds['matchEnded'] = 30;
const SNAG: Kinds['snag'] = 69;
/** `SnagEvent.expired` (data/arcade.ts): a root running out is silent; rooted, guarded and freed whip the rope. */
const SNAG_EXPIRED = 3;

/** Weather stinger per `Weather` kind (1 Sun .. 5 Eclipse). */
export const WEATHER_CUES: readonly CueName[] = ['sun', 'rain', 'sand', 'gale', 'eclipse'];

/** Arcade events (kind 40 and up) that are silent on purpose, with the reason; every other one has a cue (a test checks). */
export const SILENT: Readonly<Partial<Record<keyof Kinds, string>>> = {
  hitStop: 'the hit that caused it plays the thump',
  comboEnded: 'the combo ticks already counted it up',
  meterLevel: 'the meter shows it; the super plays the charge',
  superEnded: 'the super start and its hits carry it',
  timeOver: 'the round-end stinger plays on the same tick',
  recovered: 'no feedback in the design',
  tagIn: 'the swap sample plays (WP 20 adds the entrance)',
  weatherEnded: 'the badge and the live line say it',
  terrainChanged: 'terrain feedback is the view work package (WP 32)',
  terrainSwap: 'terrain feedback is the view work package (WP 32)',
  patchEntered: 'terrain feedback is the view work package (WP 32)',
  patchLeft: 'terrain feedback is the view work package (WP 32)',
  patchHeal: 'terrain feedback is the view work package (WP 32)',
  projectileBlocked: 'terrain feedback is the view work package (WP 32)',
  chargeEnded: 'the arrival hit plays the thump; the charge start plays the dash whoosh',
};

/** Hit thump gain by strength (light, medium, heavy, super). */
export const THUMP_GAIN = [0.35, 0.5, 0.7, 1] as const;

/**
 * Pitch factors of the hit thump (within 5% either way), indexed by the event's tick and seq: a fixed cycle rather than a
 * random draw, so a replayed match sounds the same and nothing is kept or allocated.
 */
export const PITCH_VARY = [1, 1.04, 0.97, 1.02, 0.95, 1.05, 0.98, 1.03, 0.96, 1.01] as const;

/** The combo tick climbs a semitone per hit from the second hit, up to an octave. */
export const comboPitch = (hits: number): number => 2 ** (Math.min(Math.max(hits - 2, 0), 12) / 12);

/** Pitch of the match stinger after a loss or draw. */
export const LOSS_PITCH = 0.75;

/** Most voices (one per layer) sounding at once, and the shortest gap between two plays of the same cue. */
export const MAX_VOICES = 10;
export const MIN_GAP_MS = 30;

/** The music is cut for this long on a KO, then stays ducked until `KO_DUCK_MS` (the manager's `DUCK_MS`). */
export const KO_CUT_MS = 300;
export const KO_DUCK_MS = 600;

export type PlayCue = (name: CueName, pitch: number, gain: number) => void;

/** Calls `play` for each cue of event `e` (none for a silent or Classic event). */
export function pickCues(e: SimEvent, play: PlayCue): void {
  if (e.kind === HIT) {
    const s = Math.min(3, Math.max(0, e['strength'] ?? 0));
    play(s === 3 ? 'impact' : 'thump', PITCH_VARY[(e.tick + e.seq) % PITCH_VARY.length] ?? 1, THUMP_GAIN[s] ?? 1);
    const hits = e['combo'] ?? 0;
    if (hits >= 2) play('combo', comboPitch(hits), 1);
  } else if (e.kind === WEATHER) {
    const cue = WEATHER_CUES[(e['weather'] ?? 0) - 1];
    if (cue) play(cue, 1, 1);
  } else if (e.kind === MATCH_END) {
    play('match', e['winner'] === 0 ? 1 : LOSS_PITCH, 1);
  } else if (e.kind === SNAG) {
    if (e['reason'] !== SNAG_EXPIRED) play('snag', 1, 1);
  } else {
    const cue = KIND_CUES[e.kind];
    if (cue) play(cue, 1, 1);
  }
}

/**
 * The voice pool: a cue needs one voice per layer. Times are ms on the audio clock; a voice is the function that
 * disconnects it. A cue other than a stinger is dropped when its voices would take the pool over `MAX_VOICES`, or when
 * the same cue played under `MIN_GAP_MS` ago (a multi-hit volley gives one thump per gap); a stinger (at most four
 * voices, a few per round) always plays.
 */
export class Voices {
  private readonly ends: number[] = [];
  private readonly kills: (() => void)[] = [];
  private readonly last = new Map<CueName, number>();

  /** Voices still sounding at `now` (the ended ones are released). */
  active(now: number): number {
    for (let i = this.ends.length - 1; i >= 0; i--) {
      if ((this.ends[i] ?? 0) <= now) {
        this.ends.splice(i, 1);
        this.kills.splice(i, 1)[0]?.();
      }
    }
    return this.ends.length;
  }

  /** Whether cue `name` of `layers` voices may start at `now`. */
  admit(name: CueName, layers: number, now: number): boolean {
    if (STINGERS.has(name)) return true;
    if (now - (this.last.get(name) ?? -Infinity) < MIN_GAP_MS || this.active(now) + layers > MAX_VOICES) return false;
    this.last.set(name, now);
    return true;
  }

  /** Holds a started voice until `end`. */
  add(kill: () => void, end: number): void {
    this.ends.push(end);
    this.kills.push(kill);
  }

  /** Disconnects every voice (teardown). */
  clear(): void {
    this.ends.length = 0;
    for (const kill of this.kills.splice(0)) kill();
  }
}
