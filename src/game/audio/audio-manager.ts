import type { SimEvent } from '@core/index';
import { EventDeduper } from '../fx/event-fx';
import { cueFor, type Bus } from './sound-map';

/** The slice of the Web Audio API used here, so tests can inject a fake. */
export interface GainLike {
  gain: { value: number };
  connect(dest: unknown): void;
}
export interface SourceLike {
  buffer: unknown;
  connect(dest: unknown): void;
  start(): void;
}
export interface AudioContextLike {
  readonly state: string;
  readonly destination: unknown;
  readonly currentTime: number;
  resume(): Promise<void>;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
}

/** Effects produced by the input layer that audio cares about (CTRL-M). */
export interface AudioInputEffect {
  /** `toggleMute` is the only kind audio reacts to; others are ignored. */
  readonly kind: string;
}

export interface AudioOptions {
  readonly ctx: AudioContextLike;
  /** Decoded buffers by sound id; missing ids are skipped. */
  readonly buffers: ReadonlyMap<string, unknown>;
  readonly muted?: boolean;
  /** Called when mute changes, so the caller can persist it. */
  readonly onMuteChange?: (muted: boolean) => void;
  readonly deduper?: EventDeduper;
}

export const DUCK_GAIN = 0.4;
export const DUCK_MS = 600;

/** Plays sim events as sound through music/sfx/ui gain buses. View-only; never touches sim state. */
export class AudioManager {
  /** The context and buses are read by the Arcade audio layers (`arcade-audio.ts`, a lazy chunk) to play into `sfx`. */
  readonly ctx: AudioContextLike;
  private readonly master: GainLike;
  readonly buses: Record<Bus, GainLike>;
  private readonly deduper: EventDeduper;
  private mutedFlag: boolean;
  private readonly volumes: Record<Bus, number> = { music: 1, sfx: 1, ui: 1 };
  /** Audio-clock ms until which the music is ducked; the Arcade layers extend it on a KO. */
  duckUntil = 0;
  private unlocked = false;

  constructor(private readonly opts: AudioOptions) {
    this.ctx = opts.ctx;
    this.deduper = opts.deduper ?? new EventDeduper();
    this.mutedFlag = opts.muted ?? false;
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.buses = { music: this.ctx.createGain(), sfx: this.ctx.createGain(), ui: this.ctx.createGain() };
    for (const b of Object.values(this.buses)) b.connect(this.master);
    this.applyMute();
  }

  get muted(): boolean {
    return this.mutedFlag;
  }

  setMuted(m: boolean): void {
    if (m === this.mutedFlag) return;
    this.mutedFlag = m;
    this.applyMute();
    this.opts.onMuteChange?.(m);
  }

  /** Input effect callback: CTRL-M arrives here as `toggleMute`. */
  handleInputEffect(effect: AudioInputEffect): void {
    if (effect.kind === 'toggleMute') this.setMuted(!this.mutedFlag);
  }

  setBusVolume(bus: Bus, v: number): void {
    this.volumes[bus] = Math.min(1, Math.max(0, v));
    this.updateDuck();
    if (bus !== 'music') this.buses[bus].gain.value = this.volumes[bus];
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /** Call from the first user gesture (pointerdown/keydown); resumes a suspended context once. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  /** Plays each new event's cue once; repeats of an event id are ignored. */
  consume(events: readonly SimEvent[]): void {
    for (const e of events) {
      const cue = cueFor(e);
      if (!cue || !this.deduper.firstSeen(e)) continue;
      const buffer = this.opts.buffers.get(cue.id);
      if (this.mutedFlag || !this.unlocked || buffer === undefined) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.buses[cue.bus]);
      src.start();
      if (cue.duck) this.duckUntil = this.ctx.currentTime * 1000 + DUCK_MS;
    }
    this.updateDuck();
  }

  /** Plays one sound now (view-side cues such as ability casts); silent while muted, locked or unloaded. */
  playSfx(id: string, duck = false): void {
    const buffer = this.opts.buffers.get(id);
    if (this.mutedFlag || !this.unlocked || buffer === undefined) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.buses.sfx);
    src.start();
    if (duck) this.duckUntil = this.ctx.currentTime * 1000 + DUCK_MS;
  }

  /** Call each frame (or after consume) to restore the music bus once the duck window passes. */
  updateDuck(): void {
    const ducked = this.ctx.currentTime * 1000 < this.duckUntil;
    this.buses.music.gain.value = this.volumes.music * (ducked ? DUCK_GAIN : 1);
  }

  private applyMute(): void {
    this.master.gain.value = this.mutedFlag ? 0 : 1;
  }
}
