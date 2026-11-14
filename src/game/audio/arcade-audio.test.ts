import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { SimEventKind, type SimEvent } from '@core/index';
import { addArcadeLayer, arcadeAudioState, mountArcadeAudio } from './arcade-audio';
import { KO_CUT_MS, KO_DUCK_MS, MAX_VOICES } from './arcade-cues';
import type { ArenaAudio } from './arena-audio';
import { AudioManager, DUCK_GAIN, DUCK_MS, type AudioContextLike } from './audio-manager';
import { cueFor } from './sound-map';

/** The manager makes its master and three bus gains first; the layers' output gain is the next node. */
const OUT = 4;
/** Synth voices' sources: oscillators and noise buffers (the sampled cues' sources hold a sound id string). */
const synthSources = (nodes: readonly FakeNode[]): FakeNode[] =>
  nodes.filter((n) => n.kind === 'osc' || (n.kind === 'buffer' && typeof n.buffer !== 'string'));

/** A fake Web Audio node: records its outgoing connections and, for sources, when it starts and stops. */
interface FakeNode {
  kind: string;
  outs: Set<unknown>;
  gain: FakeParam;
  frequency: FakeParam;
  type: string;
  buffer: unknown;
  started?: number;
  connect(dest: unknown): void;
  disconnect(): void;
  start(t?: number): void;
  stop(t?: number): void;
}
interface FakeParam {
  value: number;
  events: [string, number, number][];
  setValueAtTime(v: number, t: number): void;
  exponentialRampToValueAtTime(v: number, t: number): void;
}

const param = (value = 1): FakeParam => ({
  value,
  events: [],
  setValueAtTime(v, t) { this.events.push(['set', v, t]); },
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); },
});

function fakeCtx() {
  const nodes: FakeNode[] = [];
  const node = (kind: string): FakeNode => {
    const n: FakeNode = {
      kind, outs: new Set(), gain: param(), frequency: param(350), type: '', buffer: null,
      connect(dest) { this.outs.add(dest); },
      disconnect() { this.outs.clear(); },
      start(t = 0) { this.started = t; },
      stop() { /* scheduled */ },
    };
    nodes.push(n);
    return n;
  };
  const ctx = {
    state: 'running',
    destination: { kind: 'destination' },
    currentTime: 0,
    sampleRate: 8000,
    resume: () => Promise.resolve(),
    createGain: () => node('gain'),
    createBufferSource: () => node('buffer'),
    createOscillator: () => node('osc'),
    createBiquadFilter: () => node('filter'),
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  };
  return { ctx: ctx as unknown as AudioContextLike & { currentTime: number }, nodes };
}

const ev = (kind: SimEvent['kind'], extra: Record<string, number> = {}, tick = 100, seq = 0): SimEvent => ({ ...extra, tick, sourceId: 1, kind, seq });
const SOUNDS = ['damage', 'swap', 'capture', 'evilLaugh', 'whoosh', 'victory', 'death'];

function setup(opts: { muted?: boolean; unlock?: boolean; sudden?: boolean; life?: number } = {}) {
  const { ctx, nodes } = fakeCtx();
  const started: unknown[] = [];
  const createBufferSource = ctx.createBufferSource.bind(ctx);
  // Sampled cues (the sound map) start without a time; synth voices start at a scheduled time.
  (ctx as { createBufferSource: () => unknown }).createBufferSource = () => {
    const n = createBufferSource() as unknown as FakeNode;
    const start = n.start.bind(n);
    n.start = (t?: number) => { if (t === undefined) started.push(n.buffer); start(t); };
    return n;
  };
  const audio = new AudioManager({ ctx, buffers: new Map(SOUNDS.map((s) => [s, s])), muted: opts.muted ?? false });
  if (opts.unlock ?? true) audio.unlock();
  let hidden = false;
  const dispose = addArcadeLayer(audio, () => hidden, () => opts.sudden === true, () => opts.life ?? 1);
  return { ctx, nodes, audio, started, dispose, hide: (h: boolean) => { hidden = h; } };
}

const ARCADE_MATCH: SimEvent[] = [
  ev(SimEventKind.roundStarted, { round: 1 }, 1),
  ev(SimEventKind.fight, {}, 91),
  ev(SimEventKind.hitConfirmed, { strength: 1, combo: 1 }, 120),
  ev(SimEventKind.damage, { amount: 5 }, 120, 1),
  ev(SimEventKind.superStarted, { caster: 2 }, 200),
  ev(SimEventKind.ko, { team: 1, perfect: 0 }, 300),
  ev(SimEventKind.matchEnded, { winner: 0 }, 500),
];

describe('Classic sound map', () => {
  it('is unchanged: the same cue, bus and duck for every event kind', () => {
    const table = Object.fromEntries(
      Object.entries(SimEventKind).map(([n, k]) => [n, cueFor({ ...ev(k), winner: 0 }) ?? null]),
    );
    expect(table).toEqual({
      moved: null, blocked: null, damage: { id: 'damage', bus: 'sfx', duck: false }, died: null,
      swapped: { id: 'swap', bus: 'sfx', duck: false }, captured: { id: 'capture', bus: 'sfx', duck: true },
      captureFailed: { id: 'evilLaugh', bus: 'sfx', duck: true }, matchEnded: { id: 'victory', bus: 'sfx', duck: true },
      hitStop: null, hitConfirmed: null, comboEnded: null, guarded: null, parried: null, guardBroken: null, dashed: null,
      perfectDodge: null, clash: null, meterLevel: null, superStarted: { id: 'whoosh', bus: 'sfx', duck: true },
      superEnded: null, tagIn: null, roundStarted: null, fight: null, ko: null, timeOver: null, roundEnded: null, recovered: null,
      weatherChanged: null, weatherEnded: null, terrainChanged: null, terrainSwap: null, patchEntered: null, patchLeft: null,
      patchHeal: null, projectileBlocked: null, chargeStarted: null, chargeEnded: null, snag: null, trapPlaced: null, trapArmed: null, trapTriggered: null,
      elementalCast: null, elementalEnded: null, cleanse: null, hazardWarn: null, hazardStrike: null, hazardHit: null,
    });
    expect(cueFor({ ...ev(SimEventKind.matchEnded), winner: 1 })?.id).toBe('death');
  });

  it('plays the same samples with the Arcade layers on as without them', () => {
    const plain = fakeCtx();
    const startedPlain: unknown[] = [];
    const src = plain.ctx.createBufferSource.bind(plain.ctx);
    (plain.ctx as { createBufferSource: () => unknown }).createBufferSource = () => {
      const n = src() as unknown as FakeNode;
      n.start = () => { startedPlain.push(n.buffer); };
      return n;
    };
    const a = new AudioManager({ ctx: plain.ctx, buffers: new Map(SOUNDS.map((s) => [s, s])) });
    a.unlock();
    a.consume(ARCADE_MATCH);
    const layered = setup();
    layered.audio.consume(ARCADE_MATCH);
    expect(layered.started).toEqual(startedPlain);
    expect(startedPlain).toEqual(['damage', 'whoosh', 'victory']);
    layered.dispose();
  });
});

describe('Arcade audio layers', () => {
  it('synthesises every cue into the sfx bus, on top of the samples', () => {
    const s = setup();
    s.audio.consume(ARCADE_MATCH);
    const voices = synthSources(s.nodes);
    expect(voices).toHaveLength(12);
    // Every voice runs source -> filter -> envelope -> the layers' output gain -> the sfx bus.
    const out = s.nodes[OUT];
    expect(out?.outs.has(s.audio.buses.sfx)).toBe(true);
    for (const v of voices) {
      const [filter] = [...v.outs] as FakeNode[];
      const [env] = [...(filter?.outs ?? [])] as FakeNode[];
      expect(filter?.kind).toBe('filter');
      expect(env?.outs.has(out)).toBe(true);
    }
    // Round, fight, thump, charge, KO and match stingers: six cues, twelve layers.
    expect(arcadeAudioState(s.audio)).toMatchObject({ mounted: true, played: 6, voices: 12 });
    s.dispose();
  });

  it('stays silent before the first gesture, while muted and while the tab is hidden', () => {
    for (const opts of [{ unlock: false }, { muted: true }]) {
      const s = setup(opts);
      s.audio.consume(ARCADE_MATCH);
      expect(s.nodes.filter((n) => n.kind === 'osc')).toEqual([]);
      s.dispose();
    }
    const s = setup();
    s.hide(true);
    s.audio.consume(ARCADE_MATCH);
    expect(s.nodes.filter((n) => n.kind === 'osc')).toEqual([]);
    s.hide(false);
    s.audio.consume([ev(SimEventKind.parried, {}, 600)]);
    expect(s.nodes.filter((n) => n.kind === 'osc')).toHaveLength(2);
    s.dispose();
  });

  it('plays the denied buzz for a refused action, silent when muted or hidden, and is gone after teardown', () => {
    const buzz = (s: ReturnType<typeof setup>): number => {
      (s.audio as { refuse?: () => void }).refuse?.();
      return s.nodes.filter((n) => n.kind === 'osc').length;
    };
    const s = setup();
    expect(buzz(s)).toBe(2);
    s.hide(true);
    expect(buzz(s)).toBe(2);
    s.dispose();
    expect((s.audio as { refuse?: () => void }).refuse).toBeUndefined();
    const m = setup({ muted: true });
    expect(buzz(m)).toBe(0);
    m.dispose();
  });

  it('caps the voices: a burst of hits and defence cues never sounds more than MAX_VOICES at once', () => {
    const s = setup();
    const burst: SimEvent[] = [];
    const kinds = [SimEventKind.hitConfirmed, SimEventKind.guarded, SimEventKind.parried, SimEventKind.guardBroken, SimEventKind.dashed, SimEventKind.perfectDodge, SimEventKind.clash, SimEventKind.superStarted];
    for (let i = 0; i < 40; i++) burst.push(ev(kinds[i % kinds.length] ?? SimEventKind.dashed, { strength: 2, combo: 1 + i, weather: 1 + (i % 5) }, 100, i));
    s.audio.consume(burst);
    const state = arcadeAudioState(s.audio);
    expect(state.voices).toBeLessThanOrEqual(MAX_VOICES);
    expect(state.played).toBeLessThan(burst.length);
    expect(synthSources(s.nodes)).toHaveLength(state.voices);
    // Stingers still come through a full pool.
    s.audio.consume([ev(SimEventKind.roundStarted, { round: 2 }, 101)]);
    expect(arcadeAudioState(s.audio).played).toBe(state.played + 1);
    s.dispose();
  });

  it('cuts the music on a KO, then brings it back ducked, then full', () => {
    const s = setup();
    const music = s.audio.buses.music.gain;
    s.audio.consume([ev(SimEventKind.ko, { team: 1, perfect: 0 }, 300)]);
    expect(music.value).toBe(0);
    expect(arcadeAudioState(s.audio).musicCut).toBe(true);
    s.ctx.currentTime = (KO_CUT_MS - 1) / 1000;
    s.audio.consume([]);
    expect(music.value).toBe(0);
    s.ctx.currentTime = (KO_CUT_MS + 1) / 1000;
    s.audio.consume([]);
    expect(music.value).toBe(DUCK_GAIN);
    s.ctx.currentTime = (KO_DUCK_MS + 1) / 1000;
    s.audio.consume([]);
    expect(music.value).toBe(1);
    expect(KO_DUCK_MS).toBe(DUCK_MS);
    s.dispose();
  });

  it('teardown disconnects every node it made and gives the manager back its own consume', () => {
    const s = setup();
    s.audio.consume(ARCADE_MATCH);
    s.audio.consume([ev(SimEventKind.ko, { team: 1 }, 600)]);
    expect(arcadeAudioState(undefined).nodes).toBeGreaterThan(0);
    const before = s.nodes.length;
    s.dispose();
    // Everything after the manager's own gains, except the sampled cues' sources (the manager's, as in Classic).
    const made = s.nodes.slice(OUT).filter((n) => !(n.kind === 'buffer' && typeof n.buffer === 'string'));
    expect(made.length).toBeGreaterThan(20);
    expect(made.filter((n) => n.outs.size > 0)).toEqual([]);
    expect(arcadeAudioState(undefined).nodes).toBe(0);
    expect(arcadeAudioState(s.audio).mounted).toBe(false);
    // The music comes back from the cut at once, and Arcade events make no more synth voices.
    expect(s.audio.buses.music.gain.value).toBe(DUCK_GAIN);
    s.audio.consume([ev(SimEventKind.parried, {}, 900), ev(SimEventKind.damage, {}, 900, 1)]);
    expect(s.nodes.length).toBe(before + 1);
    expect(s.started.at(-1)).toBe('damage');
  });
});

/** Minimal scene events (on, once, off, emit) that count listeners. */
class Emitter {
  private readonly ls: { name: string; fn: () => void }[] = [];
  once(name: string, fn: () => void): this {
    this.ls.push({ name, fn });
    return this;
  }
  off(name: string, fn: () => void): this {
    const i = this.ls.findIndex((l) => l.name === name && l.fn === fn);
    if (i >= 0) this.ls.splice(i, 1);
    return this;
  }
  emit(name: string): void {
    for (const l of this.ls.filter((x) => x.name === name)) {
      this.off(name, l.fn);
      l.fn();
    }
  }
  get count(): number {
    return this.ls.length;
  }
}

describe('low-life heartbeat', () => {
  const oscs = (s: ReturnType<typeof setup>): number => s.nodes.filter((n) => n.kind === 'osc').length;

  it('beats (two voices) on a consumed tick while the hero is in the red, at a gap that shrinks with life', () => {
    const s = setup({ life: 0.2 });
    s.audio.consume([]);
    expect(oscs(s)).toBe(2);
    s.ctx.currentTime = 0.1;
    s.audio.consume([]);
    expect(oscs(s)).toBe(2);
    s.ctx.currentTime = 1;
    s.audio.consume([]);
    expect(oscs(s)).toBe(4);
    s.dispose();
  });

  it('is silent at healthy life, with no life left, while muted or hidden', () => {
    for (const o of [{ life: 0.6 }, { life: 0 }, { life: 0.1, muted: true }]) {
      const s = setup(o);
      s.audio.consume([]);
      expect(oscs(s), JSON.stringify(o)).toBe(0);
      s.dispose();
    }
    const h = setup({ life: 0.1 });
    h.hide(true);
    h.audio.consume([]);
    expect(oscs(h)).toBe(0);
    h.dispose();
  });

  it('defaults to no heartbeat when no life reader is given', () => {
    const { ctx } = fakeCtx();
    const audio = new AudioManager({ ctx, buffers: new Map() });
    audio.unlock();
    const dispose = addArcadeLayer(audio, () => false);
    audio.consume([]);
    expect(arcadeAudioState(audio).played).toBe(0);
    dispose();
  });
});

describe('mountArcadeAudio', () => {
  const arenaWith = (audio: ArenaAudio | undefined) => {
    const events = new Emitter();
    return { arena: { events, audio } as unknown as Phaser.Scene & { audio?: ArenaAudio }, events };
  };

  it('mounts on the Arena audio it was given and comes off on shutdown with no listener left', () => {
    const { ctx } = fakeCtx();
    const held: ArenaAudio = { audio: new AudioManager({ ctx, buffers: new Map() }), dispose: () => undefined };
    const { arena, events } = arenaWith(held);
    mountArcadeAudio(arena, held);
    expect(arcadeAudioState(held.audio).mounted).toBe(true);
    expect(events.count).toBe(2);
    events.emit('shutdown');
    expect(events.count).toBe(0);
    expect(arcadeAudioState(held.audio).mounted).toBe(false);
    expect(arcadeAudioState(undefined).nodes).toBe(0);
  });

  it('does nothing when the Arena no longer holds that audio (a later battle) or has none', () => {
    const { ctx } = fakeCtx();
    const old: ArenaAudio = { audio: new AudioManager({ ctx, buffers: new Map() }), dispose: () => undefined };
    const now: ArenaAudio = { audio: new AudioManager({ ctx, buffers: new Map() }), dispose: () => undefined };
    const { arena, events } = arenaWith(now);
    mountArcadeAudio(arena, old);
    mountArcadeAudio(arena, undefined);
    expect(events.count).toBe(0);
    expect(arcadeAudioState(old.audio).mounted).toBe(false);
    expect(arcadeAudioState(now.audio).mounted).toBe(false);
  });
});

describe('sudden-death sting', () => {
  it('plays its own sting for the sudden-death round start (3 layers) and the round cue otherwise (2 layers)', () => {
    const count = (sudden: boolean): number => {
      const s = setup({ sudden });
      const before = s.nodes.length;
      s.audio.consume([ev(SimEventKind.roundStarted, { round: 3 }, 1)]);
      expect(arcadeAudioState(s.audio).played).toBe(1);
      const made = s.nodes.length - before;
      s.dispose();
      return made;
    };
    expect(count(true)).toBeGreaterThan(count(false));
  });
});
