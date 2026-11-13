import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '@core/index';
import { MUTE_STORAGE_KEY } from './arena-audio';
import { MAX_SFX_VOICES, SFX_KINDS, VOICES, createSynth } from './element-sfx';
import { SFX_MUTE_KEY, createSfx, type SfxDeps } from './sfx';
import { VOLUME_KEY } from '../platform/volume-setting';

interface FakeNode {
  kind: string;
  outs: unknown[];
  gain: { value: number; events: [number, number][]; setValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void };
  frequency: FakeNode['gain'];
  type: string;
  buffer: unknown;
  onended: (() => void) | null;
  connect(d: unknown): void;
  disconnect(): void;
  start(t?: number): void;
  stop(t?: number): void;
}

function fakeCtx() {
  const nodes: FakeNode[] = [];
  const param = (): FakeNode['gain'] => ({
    value: 1, events: [],
    setValueAtTime(v, t) { this.events.push([v, t]); },
    exponentialRampToValueAtTime(v, t) { this.events.push([v, t]); },
  });
  const make = (kind: string): FakeNode => {
    const n: FakeNode = {
      kind, outs: [], gain: param(), frequency: param(), type: '', buffer: null, onended: null,
      connect(d) { this.outs.push(d); }, disconnect() { this.outs = []; }, start() {}, stop() {},
    };
    nodes.push(n);
    return n;
  };
  const ctx = {
    currentTime: 0, sampleRate: 100, destination: { kind: 'dest' }, resumed: 0,
    createGain: () => make('gain'), createOscillator: () => make('osc'), createBufferSource: () => make('buffer'),
    createBiquadFilter: () => make('filter'),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    resume() { this.resumed++; return Promise.resolve(); },
  };
  return { ctx, nodes };
}

describe('element voices', () => {
  it('give every element every kind, and no two elements share a cue', () => {
    const seen = new Set<string>();
    for (const e of ELEMENTS) for (const k of SFX_KINDS) {
      expect(VOICES[e][k].length).toBeGreaterThan(0);
      for (const l of VOICES[e][k]) expect(l[3]).toBeLessThanOrEqual(400);
      seen.add(JSON.stringify(VOICES[e][k]));
    }
    expect(seen.size).toBe(ELEMENTS.length * SFX_KINDS.length);
  });

  it('plays layers through a gain into the destination, scaled by gain', () => {
    const { ctx, nodes } = fakeCtx();
    const s = createSynth(ctx);
    expect(nodes[0]?.outs).toEqual([ctx.destination]);
    expect(s.play('cast', 'water', 0.5)).toBe(true);
    expect(s.active()).toBe(VOICES.water.cast.length);
    const oscs = nodes.filter((n) => n.kind === 'osc');
    const noise = nodes.filter((n) => n.kind === 'buffer');
    expect(oscs.length).toBe(1);
    expect(noise.length).toBe(1);
    // first env gain peak is the layer gain times the volume
    const env = nodes.filter((n) => n.kind === 'gain')[1];
    expect(env?.gain.events[0]?.[0]).toBeCloseTo(0.3 * 0.5);
    s.play('cast', 'water', 1);
    expect(nodes.filter((n) => n.kind === 'buffer').length).toBe(2);
    const all = nodes.filter((n) => n.kind === 'buffer');
    expect(all[0]?.buffer).toBe(all[1]?.buffer);
  });

  it('drops a cue at zero gain, and past the voice limit, and recovers as voices end', () => {
    const { ctx } = fakeCtx();
    const s = createSynth(ctx);
    expect(s.play('click', 'fire', 0)).toBe(false);
    let n = 0;
    while (s.play('cast', 'air', 1)) n++;
    expect(n).toBeGreaterThan(0);
    expect(s.active()).toBeLessThanOrEqual(MAX_SFX_VOICES);
    ctx.currentTime = 10;
    expect(s.active()).toBe(0);
    expect(s.play('cast', 'air', 1)).toBe(true);
  });

  it('disconnects a voice when it ends', () => {
    const { ctx, nodes } = fakeCtx();
    createSynth(ctx).play('click', 'earth', 1);
    const osc = nodes.find((n) => n.kind === 'osc');
    expect(osc?.outs.length).toBe(1);
    osc?.onended?.();
    expect(osc?.outs.length).toBe(0);
  });
});

describe('playSfx gating', () => {
  function setup(store: Record<string, string> = {}) {
    const { ctx } = fakeCtx();
    const listeners = new Map<string, () => void>();
    const plays: [string, string, number][] = [];
    let made = 0;
    let loaded = 0;
    const deps: SfxDeps = {
      makeContext: () => { made++; return ctx; },
      loadSynth: () => { loaded++; return Promise.resolve({ createSynth: () => ({ active: () => 0, play: (k, e, g) => { plays.push([k, e, g]); return true; } }) }); },
      storage: { getItem: (k) => store[k] ?? null },
      target: {
        addEventListener: (t, l) => { listeners.set(t, l); },
        removeEventListener: (t) => { listeners.delete(t); },
      },
    };
    return { sfx: createSfx(deps), listeners, plays, ctx, made: () => made, loaded: () => loaded };
  }
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  it('creates nothing and plays nothing before a gesture', () => {
    const t = setup();
    t.sfx.play('click', 'fire');
    expect(t.made()).toBe(0);
    expect(t.loaded()).toBe(0);
    expect(t.plays).toEqual([]);
  });

  it('first gesture creates, resumes and lazily loads once, then plays', async () => {
    const t = setup();
    t.listeners.get('pointerdown')?.();
    expect(t.made()).toBe(1);
    expect(t.ctx.resumed).toBe(1);
    expect(t.listeners.size).toBe(0);
    await settle();
    expect(t.sfx.ready).toBe(true);
    t.sfx.play('cleanse', 'water');
    expect(t.plays).toEqual([['cleanse', 'water', 1]]);
    expect(t.loaded()).toBe(1);
  });

  it('passes the sfx bus volume and honours mute', async () => {
    const t = setup({ [VOLUME_KEY]: JSON.stringify({ music: 1, sfx: 0.25 }) });
    t.listeners.get('keydown')?.();
    await settle();
    t.sfx.play('hit', 'earth');
    expect(t.plays[0]?.[2]).toBe(0.25);
    const m = setup({ [SFX_MUTE_KEY]: '1' });
    m.listeners.get('keydown')?.();
    await settle();
    m.sfx.play('hit', 'earth');
    expect(m.plays).toEqual([]);
  });

  it('shares the mute key with the battle audio', () => {
    expect(SFX_MUTE_KEY).toBe(MUTE_STORAGE_KEY);
  });

  it('stays silent when Web Audio is missing, and dispose removes listeners', () => {
    const { sfx, listeners } = setup();
    sfx.dispose();
    expect(listeners.size).toBe(0);
    const none = createSfx({ makeContext: () => undefined, loadSynth: () => Promise.reject(new Error('x')), storage: undefined, target: undefined });
    none.play('click', 'air');
    expect(none.ready).toBe(false);
  });
});
